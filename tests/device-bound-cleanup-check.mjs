import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const server = await createServer({
  server: { host: '127.0.0.1', port: 0, watch: null },
  plugins: [{ name: 'device-bound-cleanup-proof', configResolved(config) { config.server.watch = null; } }]
});
await server.listen();
const browser = await launchChromium();
try {
  for (const mode of ['passphrase', 'pin']) {
    const context = await browser.newContext({ locale: 'en' });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    try {
      await page.goto(server.resolvedUrls.local[0]);
      await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
      if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
      await page.evaluate(async () => {
        const { changeAccessMode } = await import('/src/lib/stores/boot.svelte.ts');
        const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
        prefs.lockAfter = 'restart';
        prefs.onboarded = true;
        await changeAccessMode('device-bound', '');
        const { goto } = await import('/node_modules/@sveltejs/kit/src/runtime/app/navigation.js');
        await goto('/settings/access-mode');
        const remove = FileSystemDirectoryHandle.prototype.removeEntry;
        FileSystemDirectoryHandle.prototype.removeEntry = function (name, ...args) {
          if (name === 'device-key.json' && !window.allowDeviceCleanup) {
            return Promise.reject(new Error('synthetic device-bound removal failure'));
          }
          return remove.call(this, name, ...args);
        };
      });
      await page.locator(`[data-list-row="${mode}"]`).click();
      await page.locator('[data-access-continue]').click();
      const secret = mode === 'pin' ? '1234' : 'synthetic cleanup passphrase';
      if (mode === 'pin') {
        for (const digit of secret + secret) await page.locator(`[data-key="${digit}"]`).click();
      } else {
        await page.locator('#am-passphrase').fill(secret);
        await page.locator('#am-passphrase-confirm').fill(secret);
        await page.locator('[data-access-submit]').click();
      }
      await page.waitForFunction(() => document.querySelector('[data-access-status]')?.textContent.trim());
      const incomplete = await page.evaluate(async () => {
        const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
        const { readKeystoreSource } = await import('/src/lib/data/keystore-file.ts');
        const { deviceBoundJournalExists } = await import('/src/lib/data/device-bound-journal.ts');
        const { m } = await import('/src/lib/paraglide/messages.js');
        return {
          mode: bootState.accessMode,
          durableMode: await readKeystoreSource(),
          leftover: await deviceBoundJournalExists(),
          refusal: document.querySelector('[data-access-status]').textContent.trim() === m.am_change_failed(),
          changed: document.body.textContent.includes(m.am_changed_toast())
        };
      });
      assert.deepEqual(incomplete, { mode: 'device-bound', durableMode: mode, leftover: true, refusal: true, changed: false });
      await page.evaluate(() => { window.allowDeviceCleanup = true; });
      if (mode === 'pin') {
        await page.locator('[data-access-secret-back]').click();
        await page.locator('[data-access-continue]').click();
        for (const digit of secret + secret) await page.locator(`[data-key="${digit}"]`).click();
      } else await page.locator('[data-access-submit]').click();
      await page.waitForURL('**/settings/security');
      const complete = await page.evaluate(async ({ mode, secret }) => {
        const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
        const { deviceBoundJournalExists, browserKeySlot } = await import('/src/lib/data/device-bound-journal.ts');
        const { unlockJournalPin } = await import('/src/lib/data/journal-pin.ts');
        const { unlockJournalPassphrase } = await import('/src/lib/data/journal-passphrase.ts');
        const dataKey = mode === 'pin' ? await unlockJournalPin(secret) : await unlockJournalPassphrase(secret);
        return { mode: bootState.accessMode, leftover: await deviceBoundJournalExists(), keyGone: (await browserKeySlot('journal-device-key').load()) === null, keyLength: dataKey.length };
      }, { mode, secret });
      assert.deepEqual(complete, { mode, leftover: false, keyGone: true, keyLength: 32 });
      console.log(`PASS mounted ${mode} removal failure reports incomplete, keeps retry available and removes old material on retry`);

      // Recreate only the surveyed leftover, then let the real next boot own it.
      await page.evaluate(async ({ mode, secret }) => {
        const { addDeviceBoundJournal } = await import('/src/lib/data/device-bound-journal.ts');
        const { unlockJournalPin } = await import('/src/lib/data/journal-pin.ts');
        const { unlockJournalPassphrase } = await import('/src/lib/data/journal-passphrase.ts');
        await addDeviceBoundJournal(mode === 'pin' ? await unlockJournalPin(secret) : await unlockJournalPassphrase(secret));
      }, { mode, secret });
      await page.reload();
      if (mode === 'pin') {
        await page.waitForSelector('[data-pin-pad]');
        for (const digit of secret) await page.locator(`[data-key="${digit}"]`).click();
      } else {
        await page.waitForSelector('#journal-passphrase');
        await page.locator('#journal-passphrase').fill(secret);
        await page.locator('[data-passphrase-submit]').click();
      }
      await page.waitForSelector('[data-app-root][data-boot="ready"]');
      assert.equal(await page.evaluate(async () => {
        const { deviceBoundJournalExists, browserKeySlot } = await import('/src/lib/data/device-bound-journal.ts');
        return !(await deviceBoundJournalExists()) && (await browserKeySlot('journal-device-key').load()) === null;
      }), true);
      console.log(`PASS real ${mode} cold boot removes the surveyed leftover after successful secret unlock`);
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  await server.close();
}
