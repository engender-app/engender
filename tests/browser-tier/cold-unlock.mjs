import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = `/@fs${resolve(import.meta.dirname, '../../src/lib')}`;
const secret = 'cold-unlock-regression';

/** Real boot, gates, KDF and storage. Visibility events are injected because
 * headless Chromium keeps every tab visible. Only platform credentials are
 * stubbed; their returned secrets still pass through the production owners. */
export async function coldUnlock(browser, origin) {
  const verified = [];
  for (const mode of ['passphrase', 'pin', 'biometric', 'recovery', 'native']) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.addInitScript((native) => {
        window.__DEMO__ = false;
        window.__APP_VERSION__ = '0.0.0-browser-tier';
        window.closedJournalWorkers = 0;
        window.lockWhenJournalOpens = false;
        window.reconcileBusy = [];
        const BrowserWorker = window.Worker;
        window.Worker = class extends BrowserWorker {
          constructor(url, options) {
            super(url, options);
            this.journalWorker = String(url).includes('mc-worker');
          }
          terminate() {
            if (this.journalWorker) window.closedJournalWorkers++;
            super.terminate();
          }
          postMessage(message, ...options) {
            if (this.journalWorker && message.op === 'query' && message.args.sql === 'PRAGMA application_id') {
              window.reconcileBusy.push(window.coldBusy.journalIsBusy());
            }
            super.postMessage(message, ...options);
            if (this.journalWorker && message.op === 'open' && window.lockWhenJournalOpens) {
              window.lockWhenJournalOpens = false;
              Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
              document.dispatchEvent(new Event('visibilitychange'));
            }
          }
        };
        const credential = {
          rawId: new Uint8Array([1]).buffer,
          getClientExtensionResults: () => ({ prf: { enabled: true, results: { first: new Uint8Array(32).fill(7).buffer } } })
        };
        Object.defineProperty(navigator, 'credentials', { value: {
          create: async () => credential, get: async () => credential
        } });
        if (!native) return;
        window.androidBridge = {};
        window.Capacitor = {
          PluginHeaders: [
            { name: 'Keystore', methods: ['status', 'unlock'].map((name) => ({ name, rtype: 'promise' })) },
            { name: 'Sqlite', methods: [{ name: 'isPlaintextDatabase', rtype: 'promise' }] }
          ],
          nativePromise: async (_plugin, method) => {
            if (method === 'status') return { hasKey: true, authRequired: true };
            if (method === 'isPlaintextDatabase') return { plaintext: false };
            if (method === 'unlock') return new Promise((resolve) => { window.answerNative = resolve; });
            throw new Error(`unexpected native call: ${method}`);
          }
        };
      }, mode === 'native');
      const load = async () => {
        await page.goto(`${origin}/cold-unlock.html`);
        await page.evaluate(async (source) => {
          window.coldBoot = await import(`${source}/stores/boot.svelte.ts`);
          window.coldLock = await import(`${source}/stores/lock.svelte.ts`);
          window.coldPrefs = await import(`${source}/data/prefs/store.svelte.ts`);
          window.coldBusy = await import(`${source}/data/journal-busy.ts`);
          coldBoot.startBoot();
          coldLock.watchLock(coldBoot.closeJournalForLock);
        }, source);
      };
      await load();
      let recoveryKey;
      if (mode !== 'native') {
        await page.waitForFunction(() => coldBoot.bootState.status === 'needs-setup');
        assert.equal(await page.evaluate(({ mode, secret }) => coldBoot.submitAccessModeSetup(
          mode === 'recovery' ? 'passphrase' : mode, mode === 'pin' ? '1234' : secret
        ), { mode, secret }), 'ok');
        await page.waitForFunction(() => coldBoot.bootState.status === 'ready');
        assert.deepEqual(await page.evaluate(() => window.reconcileBusy), [true], `${mode} setup reconciliation guard`);
        await page.evaluate(() => coldPrefs.setPreferenceDurably('lockAfter', 'immediately'));
        if (mode === 'recovery') {
          recoveryKey = await page.evaluate(async (source) => {
            const { mintRecoveryKey } = await import(`${source}/data/recovery-key.ts`);
            return mintRecoveryKey(await coldBoot.journalDataKey());
          }, source);
        }
        await load();
      }
      const gateState = mode === 'native' ? 'needs-authentication' : 'needs-unlock';
      await page.waitForFunction((state) => coldBoot.bootState.status === state, gateState);
      await page.evaluate(async ({ source, mode }) => {
        if (mode === 'native') coldPrefs.prefs.lockAfter = 'immediately';
        const { mountInto } = await import('/mount.ts');
        const component = mode === 'native' ? 'AndroidKeyGate' : mode === 'recovery' ? 'RecoveryKeyEntry' : 'JournalGate';
        const { default: Gate } = await import(`${source}/components/${component}.svelte`);
        mountInto(Gate, mode === 'recovery' ? { onBack() {} } : {}, document.getElementById('gate'));
      }, { source, mode });
      const button = mode === 'pin' ? '[data-key="1"]' : mode === 'biometric' ? '[data-biometric-submit]'
        : mode === 'recovery' ? '[data-submit-recovery-key]' : mode === 'native' ? '[data-key-retry]' : '[data-passphrase-submit]';
      if (mode === 'native') await page.waitForFunction(() => typeof window.answerNative === 'function');
      else await page.waitForFunction((button) => document.querySelector(button)?.disabled === false, button);
      if (mode === 'passphrase') await page.locator('#journal-passphrase').fill(secret);
      if (mode === 'recovery') await page.locator('[data-recovery-key-input]').fill(recoveryKey);
      await page.evaluate(({ mode, button }) => {
        if (mode === 'pin') for (const digit of '1234') document.querySelector(`[data-key="${digit}"]`).click();
        else if (mode !== 'native') document.querySelector(button).click();
        if (mode === 'native') {
          window.__lockOnLeaveFromNative(false);
          window.answerNative({ outcome: 'authenticated', hexKey: '07'.repeat(32) });
        } else {
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
          document.dispatchEvent(new Event('visibilitychange'));
        }
      }, { mode, button });
      await page.waitForFunction(({ button, state }) =>
        coldBoot.bootState.status !== state || document.querySelector(button)?.disabled === false,
      { button, state: gateState });
      const cancelled = await page.evaluate(() => ({
        status: coldBoot.bootState.status, locked: coldLock.isLocked(coldBoot.bootState.accessMode),
        recovery: coldBoot.recoveryUnlock.used, timing: coldPrefs.prefs.lockAfter,
        errors: [...document.querySelectorAll('[role="alert"]')].map((node) => node.textContent.trim()).filter(Boolean),
        attempts: JSON.parse(localStorage.getItem('engender-pin-attempts') ?? 'null')?.wrongAttempts ?? 0
      }));
      assert.deepEqual(cancelled, { status: gateState, locked: true, recovery: false, timing: 'immediately', errors: [], attempts: 0 }, mode);
      await page.evaluate((native) => {
        if (native) window.__lockOnReturnFromNative();
        else {
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
          document.dispatchEvent(new Event('visibilitychange'));
        }
      }, mode === 'native');
      assert.equal(await page.evaluate(() => coldLock.isLocked(coldBoot.bootState.accessMode)), true, `${mode} return`);
      if (mode === 'native') {
        // An ordinary refusal still reaches the native gate after cancellation.
        await page.locator(button).click();
        await page.evaluate(() => window.answerNative({ outcome: 'cancelled' }));
        await page.waitForFunction(() => coldBoot.bootState.androidKey?.authentication?.outcome === 'cancelled');
      } else {
        if (mode === 'pin') for (const digit of '1234') await page.locator(`[data-key="${digit}"]`).click();
        else await page.locator(button).click();
        await page.waitForFunction(() => coldBoot.bootState.status === 'ready');
        assert.equal(await page.evaluate(() => coldLock.isLocked(coldBoot.bootState.accessMode)), false, `${mode} retry`);
        assert.equal(await page.evaluate(() => coldBoot.recoveryUnlock.used), mode === 'recovery');
        assert.deepEqual(await page.evaluate(() => window.reconcileBusy), [true], `${mode} unlock reconciliation guard`);

        const entryId = await page.evaluate(() => coldBoot.bootState.journal.entries.upsertEntry({
          epochDay: 20000, mood: 3, note: 'Kept across a cancelled cold boot'
        }));
        await load();
        await page.waitForFunction(() => coldBoot.bootState.status === 'needs-unlock');
        const submit = async ({ mode, secret, recoveryKey, leave }) => {
          // Hide after the real worker receives its key, before it answers.
          window.lockWhenJournalOpens = leave;
          if (mode === 'pin') await coldBoot.submitPinUnlock('1234');
          else if (mode === 'biometric') await coldBoot.submitBiometricUnlock();
          else if (mode === 'recovery') await coldBoot.submitRecoveryKeyUnlock(recoveryKey);
          else await coldBoot.submitPassphraseUnlock(secret);
        };
        await page.evaluate(submit, { mode, secret, recoveryKey, leave: true });
        await page.waitForFunction(() => window.closedJournalWorkers > 0 || coldBoot.bootState.status === 'ready');
        const afterBootLock = await page.evaluate(async () => ({
          status: coldBoot.bootState.status,
          locked: coldLock.isLocked(coldBoot.bootState.accessMode),
          journalPresent: coldBoot.bootState.journal !== null,
          workerClosed: window.closedJournalWorkers > 0,
          key: await Promise.race([
            coldBoot.journalDataKey().then(() => 'available'),
            new Promise((resolve) => setTimeout(() => resolve('blocked'), 100))
          ])
        }));
        assert.deepEqual(afterBootLock, {
          status: 'needs-unlock', locked: true, journalPresent: false, workerClosed: true, key: 'blocked'
        }, `${mode} lock after derivation`);
        await page.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await page.evaluate(submit, { mode, secret, recoveryKey, leave: false });
        await page.waitForFunction(() => coldBoot.bootState.status === 'ready');
        assert.equal(await page.evaluate(() => coldLock.isLocked(coldBoot.bootState.accessMode)), false, `${mode} later unlock`);
        assert.equal(await page.evaluate((entryId) => coldBoot.bootState.journal.entries.getEntry(entryId)
          .then((entry) => entry.note), entryId), 'Kept across a cancelled cold boot', `${mode} retained contents`);
        assert.equal(await page.evaluate(() => coldBoot.recoveryUnlock.used), mode === 'recovery');
        if (mode === 'passphrase') {
          await load();
          await page.waitForFunction(() => coldBoot.bootState.status === 'needs-unlock');
          await page.evaluate(() => {
            window.realViewTransition = document.startViewTransition;
            window.heldPublications = [];
            document.startViewTransition = (commit) => {
              let finish;
              const finished = new Promise((resolve) => { finish = resolve; });
              window.heldPublications.push(async () => { await commit(); finish(); });
              return { ready: Promise.resolve(), finished };
            };
          });
          await page.evaluate(submit, { mode, secret, recoveryKey, leave: false });
          const beforePublication = await page.evaluate(async () => ({
            keyBytes: (await coldBoot.journalDataKey()).length,
            status: coldBoot.bootState.status
          }));
          assert.deepEqual(beforePublication, { keyBytes: 32, status: 'needs-unlock' });
          const whilePublicationWaits = await page.evaluate(async () => {
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
            document.dispatchEvent(new Event('visibilitychange'));
            await coldBoot.closeJournalForLock();
            return {
              locked: coldLock.isLocked(coldBoot.bootState.accessMode),
              workerClosed: window.closedJournalWorkers > 0,
              key: await Promise.race([
                coldBoot.journalDataKey().then(() => 'available'),
                new Promise((resolve) => setTimeout(() => resolve('blocked'), 100))
              ])
            };
          });
          assert.deepEqual(whilePublicationWaits, {
            locked: true, workerClosed: true, key: 'blocked'
          }, 'lock while ready-state publication waits');
          await page.evaluate(async () => {
            document.startViewTransition = window.realViewTransition;
            for (const publish of window.heldPublications) await publish();
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
            document.dispatchEvent(new Event('visibilitychange'));
          });
          await page.waitForFunction(() => coldBoot.bootState.status === 'ready');
          assert.equal(await page.evaluate(() => coldBoot.bootState.journal), null);
          await page.evaluate(async ({ source, secret }) => {
            const { unlockJournalPassphrase } = await import(`${source}/data/journal-passphrase.ts`);
            const current = coldLock.beginSessionUnlock();
            await coldBoot.reopenJournalAfterUnlock(await unlockJournalPassphrase(secret), current);
            current();
            coldLock.markUnlocked();
          }, { source, secret });
          assert.equal(await page.evaluate((entryId) => coldBoot.bootState.journal.entries.getEntry(entryId)
            .then((entry) => entry.note), entryId), 'Kept across a cancelled cold boot', 'unlock after delayed publication');
        }
      }
      assert.deepEqual(errors, [], mode);
      verified.push(mode);
    } finally {
      await context.close();
    }
  }
  return verified;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { createServer } = await import('vite');
  const { launchChromium } = await import('../browser-harness.mjs');
  const server = await createServer({ configFile: resolve(import.meta.dirname, 'browser-tier.vite.config.ts'), server: { port: 0, watch: null } });
  await server.listen();
  const browser = await launchChromium();
  try {
    console.log(await coldUnlock(browser, `http://localhost:${server.config.server.port}`));
  } finally {
    await browser.close();
    await server.close();
  }
}
