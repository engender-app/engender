import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { newCapabilityContext, launchBrowser, browserEngine } from './browser-harness.mjs';

const server = await createServer({ server: { port: 0 } });
await server.listen();
const browser = await launchBrowser();
const context = await newCapabilityContext(browser);
const page = await context.newPage();
if (browserEngine() === 'chromium') {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal',
    hasResidentKey: true, hasUserVerification: true, isUserVerified: true,
    automaticPresenceSimulation: true, hasPrf: true
  } });
}
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

async function visibility(value) {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'visibilityState', { value, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, value);
}
async function state() {
  return page.evaluate(async () => {
    const { lockState } = await import('/src/lib/stores/lock.svelte.ts');
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    const { reference } = await import('/src/lib/data/live/reference.svelte.ts');
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    const accessible = await Promise.race([
      journal.tags.getTagGroups().then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 100))
    ]);
    return { unlocked: lockState.unlocked, journal: !!bootState.journal,
      accessible, referenceReady: reference.ready, gate: !!document.querySelector('[data-applock]') };
  });
}
let mode = 'passphrase';
let phase = 'startup';
async function submit(secret = mode === 'pin' ? '1234' : 'demo') {
  if (mode === 'biometric') {
    await page.locator('[data-session-biometric]').click();
    return;
  }
  if (mode === 'pin') {
    for (const digit of secret) await page.locator(`[data-key="${digit}"]`).click();
    return;
  }
  await page.locator('#session-passphrase').fill(secret);
  await page.locator('[data-session-submit]').click();
}

try {
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
  await page.evaluate(async () => {
    const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
    prefs.lockAfter = 'immediately';
  });
  for (const accessMode of (browserEngine() === 'chromium' ? ['passphrase', 'pin', 'biometric'] : ['passphrase', 'pin'])) {
    mode = accessMode;
    phase = 'change-mode';
    if (mode !== 'passphrase') await page.evaluate(async (mode) => {
      const { changeAccessMode } = await import('/src/lib/stores/boot.svelte.ts');
      await changeAccessMode(mode, '1234');
    }, mode);
    if (mode !== 'biometric') {
      phase = 'wrong-secret';
      await visibility('hidden');
      await page.waitForSelector('[data-applock]');
      await visibility('visible');
      await submit(mode === 'pin' ? '9999' : 'wrong secret');
      await page.waitForSelector('[data-pin-status="wrong"]');
      assert.equal((await state()).unlocked, false, `${mode}: wrong secret stays locked`);
      if (mode === 'pin') {
        const attempts = await page.evaluate(() => JSON.parse(localStorage.getItem('engender-pin-attempts')));
        assert.equal(attempts.wrongAttempts, 1, 'wrong PIN still counts toward throttling');
      }
      await submit();
      await page.waitForSelector('[data-applock]', { state: 'detached' });
      console.log(`PASS ${mode}: wrong secret stays locked`);
    }
    for (const stage of ['derivation', 'reopen', 'hydration', 'transition']) {
      phase = stage;
      await page.evaluate(async () => {
        const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
        window.beforeLockJournal = bootState.journal;
      });
      await visibility('hidden');
      await page.waitForSelector('[data-applock]');
      await visibility('visible');
      await page.evaluate((stage) => {
        window.unlockReached = false;
        if (stage === 'derivation') {
          const decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
          crypto.subtle.decrypt = async (...args) => {
            const result = await decrypt(...args);
            crypto.subtle.decrypt = decrypt;
            window.unlockReached = true;
            await new Promise((resolve) => { window.releaseUnlock = resolve; });
            return result;
          };
        } else if (stage === 'reopen' || stage === 'hydration') {
        // Hold genuine preferences loading or hydration, on either side of the old publication point.
          const post = Worker.prototype.postMessage;
          Worker.prototype.postMessage = function (message, ...args) {
            if (message.op === 'query' && (stage === 'reopen' ? message.args.sql === 'SELECT key, value FROM pref' : message.args.sql.includes('FROM gender_dimension ORDER'))) {
              Worker.prototype.postMessage = post;
              const receive = this.onmessage;
              this.onmessage = (event) => {
                if (event.data.id !== message.id) return receive.call(this, event);
                this.onmessage = receive;
                window.unlockReached = true;
                window.releaseUnlock = () => receive.call(this, event);
              };
            }
            return post.call(this, message, ...args);
          };
        } else {
          const start = document.startViewTransition;
          document.startViewTransition = (commit) => {
            document.startViewTransition = start;
            window.unlockReached = true;
            const finished = new Promise((resolve, reject) => {
              window.releaseUnlock = () => Promise.resolve(commit()).then(resolve, reject);
            });
            return { ready: Promise.resolve(), finished };
          };
        }
      }, stage);
      await submit();
      await page.waitForFunction(() => window.unlockReached);
      const attemptsBefore = await page.evaluate(() => localStorage.getItem('engender-pin-attempts'));
      await visibility('hidden');
      if (stage === 'hydration') {
        const capturedReadable = await page.evaluate(() => Promise.race([
          window.beforeLockJournal.tags.getTagGroups().then(() => true),
          new Promise((resolve) => setTimeout(() => resolve(false), 100))
        ]));
        assert.equal(capturedReadable, false, `${mode}: a newer lock revokes the connection while hydration is held`);
      }
      await page.evaluate(() => window.releaseUnlock());
      await page.waitForFunction(() => document.querySelector('[data-session-submit], [data-session-biometric], [data-key="1"]')?.disabled === false);
      assert.deepEqual(await state(), { unlocked: false, journal: false, accessible: false, referenceReady: false, gate: true }, stage);
      assert.equal(await page.evaluate(() => localStorage.getItem('engender-pin-attempts')), attemptsBefore, `${mode}: cancellation is not a wrong PIN`);
      await visibility('visible');
      assert.equal((await state()).gate, true, `${stage}: returning still requires authentication`);
      await submit();
      await page.waitForSelector('[data-applock]', { state: 'detached' });
      assert.deepEqual(await state(), { unlocked: true, journal: true, accessible: true, referenceReady: true, gate: false }, `${stage}: fresh authentication`);
      console.log(`PASS ${mode} ${stage}: later lock remains authoritative; fresh authentication succeeds`);
    }
    await visibility('hidden');
    await page.waitForSelector('[data-applock]');
    await visibility('visible');
    phase = 'reopen-failure';
    const attemptsBeforeFailure = await page.evaluate(() => localStorage.getItem('engender-pin-attempts'));
    await page.evaluate(() => {
      window.reopenFaultResponse = null;
      const reopening = new WeakMap();
      let workerId = 0;
      const post = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (message, ...args) {
        if (message.op === 'open' && message.args.path === 'engender.sqlite3') {
          reopening.set(this, { workerId: ++workerId, openRequestId: message.id, path: message.args.path });
        }
        const opened = reopening.get(this);
        if (opened && message.op === 'query' && message.args.sql === 'SELECT key, value FROM pref') {
          Worker.prototype.postMessage = post;
          const receive = this.onmessage;
          this.onmessage = (event) => {
            if (event.data.id !== message.id) return receive.call(this, event);
            this.onmessage = receive;
            window.reopenFaultResponse = { ...opened, requestId: message.id, responseId: event.data.id,
              sql: message.args.sql, originalOk: event.data.ok };
            if (!event.data.ok) return receive.call(this, event);
            receive.call(this, { data: { id: message.id, ok: false, error: 'injected reopen failure' } });
          };
        }
        return post.call(this, message, ...args);
      };
    });
    await submit();
    await page.waitForFunction(() => window.reopenFaultResponse !== null);
    const fault = await page.evaluate(() => window.reopenFaultResponse);
    assert.equal(fault.responseId, fault.requestId);
    assert.equal(fault.originalOk, true, `${mode}: fault replaces a successful real reopen response`);
    assert.equal(fault.sql, 'SELECT key, value FROM pref');
    assert.equal(fault.path, 'engender.sqlite3');
    assert.ok(fault.requestId > fault.openRequestId, `${mode}: fault belongs to the newly opened journal worker`);
    console.log('INJECTED REOPEN FAILURE', mode, JSON.stringify(fault));
    await page.waitForSelector('[data-pin-status="wrong"]');
    assert.deepEqual(await state(), { unlocked: false, journal: false, accessible: false, referenceReady: false, gate: true }, `${mode}: failed reopen`);
    assert.equal(await page.evaluate(() => localStorage.getItem('engender-pin-attempts')), attemptsBeforeFailure, `${mode}: failed reopen is not a wrong PIN`);
    await submit();
    await page.waitForSelector('[data-applock]', { state: 'detached' });
    console.log(`PASS ${mode}: failed reopen stays locked; fresh authentication succeeds`);
  }
  assert.deepEqual(errors, [], 'no uncaught browser errors');
} catch (error) {
  console.error('UNLOCK PROBE FAILURE', JSON.stringify({ mode, phase,
    fault: await page.evaluate(() => window.reopenFaultResponse ?? null).catch(() => null),
    state: await state().catch(failure => ({ error: String(failure) })),
    document: await page.locator('body').innerText().catch(() => 'unavailable')
  }));
  throw error;
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
