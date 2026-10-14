import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';

// Real session, crypto, storage and mounted prompts. Only WebAuthn is a fake
// platform port; these checks do not claim enrolled hardware verification.
const server = await createServer({ server: { port: 0, watch: null, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const browser = await launchChromium();
const prompt = { title: 'Synthetic approval', subtitle: 'Synthetic journal only', cancel: 'Cancel' };
try {
  for (const mode of ['passphrase', 'pin', 'biometric']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    try {
      await page.addInitScript(() => {
        const credential = { rawId: new Uint8Array([1]).buffer, getClientExtensionResults: () => ({ prf: { enabled: true, results: { first: new Uint8Array(32).fill(7).buffer } } }) };
        Object.defineProperty(navigator, 'credentials', { value: { create: async () => credential, get: async () => {
          if (window.refuseBiometric) throw new DOMException('Synthetic cancellation', 'NotAllowedError');
          return credential;
        } } });
      });
      await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
      if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
      if (mode !== 'passphrase') await page.evaluate(async ({mode, prompt}) => {
        const boot = await import('/src/lib/stores/boot.svelte.ts');
        await boot.prepareAccessModeChange(mode, mode === 'pin' ? '1234' : '', prompt, () => {})('demo');
      }, {mode, prompt});
      await page.evaluate(async () => {
        const { goto } = await import('/node_modules/@sveltejs/kit/src/runtime/app/navigation.js');
        await goto('/settings/recovery-key');
      });
      const readWrap = () => page.evaluate(async () => {
        const root = await navigator.storage.getDirectory();
        try { return await (await (await root.getFileHandle('recovery-key.json')).getFile()).text(); }
        catch (error) { if (error.name === 'NotFoundError') return null; throw error; }
      });
      const approve = async (wrong = false) => {
        if (mode === 'pin') {
          for (const digit of wrong ? '9999' : '1234') await page.locator('[data-current-protection]').locator(`[data-key="${digit}"]`).click();
        } else {
          if (mode === 'passphrase') await page.locator('#current-protection-secret').fill(wrong ? 'wrong current passphrase' : 'demo');
          else await page.evaluate(wrong => { window.refuseBiometric = wrong; }, wrong);
          await page.locator('[data-confirm-current-protection]').click();
        }
      };
      await page.locator('[data-make-recovery-key]').click();
      await approve(true);
      if (mode === 'pin') await page.waitForSelector('[data-pin-status="wrong"]');
      else await page.waitForFunction(() => document.querySelector('[data-protection-status]')?.textContent.trim());
      assert.equal(await readWrap(), null);
      await page.locator('[data-current-protection] .btn-ghost').click();
      assert.equal(await readWrap(), null);
      await page.locator('[data-make-recovery-key]').click();
      await approve();
      await page.waitForSelector('[data-recovery-key]');
      const first = await page.locator('[data-recovery-key]').innerText();
      const originalWrap = await readWrap();
      await page.locator('[data-recovery-key-done]').click();
      await page.locator('[data-list-row="replace-recovery-key"]').click();
      await page.locator('[data-confirm-replace]').click();
      assert.equal(await readWrap(), originalWrap);
      await page.locator('[data-current-protection] .btn-ghost').click();
      assert.equal(await readWrap(), originalWrap);
      await page.locator('[data-list-row="replace-recovery-key"]').click();
      await page.locator('[data-confirm-replace]').click();
      await approve();
      await page.waitForSelector('[data-recovery-key]');
      const replacement = await page.locator('[data-recovery-key]').innerText();
      assert.notEqual(replacement, first);
      const result = await page.evaluate(async ({first, replacement}) => {
        const { openWithRecoveryKey } = await import('/src/lib/data/recovery-key.ts');
        let oldRejected = false;
        try { await openWithRecoveryKey(first); } catch { oldRejected = true; }
        return { oldRejected, newLength: (await openWithRecoveryKey(replacement)).length };
      }, {first, replacement});
      assert.deepEqual(result, { oldRejected: true, newLength: 32 });
      await page.locator('[data-recovery-key-done]').click();
      const once = await page.evaluate(async ({mode,prompt}) => {
        const boot = await import('/src/lib/stores/boot.svelte.ts');
        const op = boot.prepareRecoveryKeyChange(prompt, () => {});
        const secret = mode === 'pin' ? '1234' : mode === 'passphrase' ? 'demo' : '';
        const written = await op(secret);
        try { await op(secret); return { rejected: false, written }; } catch { return { rejected: true, written }; }
      }, {mode,prompt});
      assert.equal(once.rejected, true);
      const changed = await page.evaluate(async ({mode, prompt}) => {
        const boot = await import('/src/lib/stores/boot.svelte.ts');
        const { readKeystoreFile } = await import('/src/lib/data/keystore-file.ts');
        const { serializeKeystore } = await import('/src/lib/crypto/keystore.ts');
        const before = serializeKeystore(await readKeystoreFile());
        const op = boot.prepareAccessModeChange('device-bound', '', prompt, () => {});
        let refused = false;
        if (mode === 'biometric') window.refuseBiometric = true;
        try { await op(mode === 'pin' ? '9999' : 'not the current passphrase'); }
        catch { refused = true; }
        window.refuseBiometric = false;
        const unchanged = serializeKeystore(await readKeystoreFile()) === before;
        await op(mode === 'pin' ? '1234' : mode === 'passphrase' ? 'demo' : '');
        return { refused, unchanged, current: boot.bootState.accessMode };
      }, {mode,prompt});
      assert.deepEqual(changed, { refused: true, unchanged: true, current: 'device-bound' });
      await page.locator('[data-list-row="replace-recovery-key"]').click();
      await page.locator('[data-confirm-replace]').click();
      await page.waitForSelector('[data-protection-web-exception]');
      await page.locator('[data-current-protection] .btn-ghost').click();
      await page.evaluate(async ({mode,prompt}) => {
        const boot = await import('/src/lib/stores/boot.svelte.ts');
        await boot.prepareAccessModeChange(mode, mode === 'pin' ? '1234' : mode === 'passphrase' ? 'demo' : '', prompt, () => {})();
      }, {mode,prompt});
      console.log(`PASS ${mode}: current proof, refusal/cancel, mint, replacement, old-key rejection one-use approval and authenticated access-mode change`);
      if (mode === 'pin') {
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForSelector('[data-use-recovery-key]');
        await page.locator('[data-use-recovery-key]').click();
        await page.locator('[data-recovery-key-input]').fill(once.written);
        await page.locator('[data-submit-recovery-key]').click();
        await page.waitForSelector('[data-post-recovery-setup]');
        const recoveryCannotMint = await page.evaluate(async prompt => {
          const boot = await import('/src/lib/stores/boot.svelte.ts');
          try { await boot.prepareRecoveryKeyChange(prompt, () => {})('1234'); return false; }
          catch { return true; }
        }, prompt);
        assert.equal(recoveryCannotMint, true);
        await page.evaluate(() => {
          const create = FileSystemFileHandle.prototype.createWritable;
          FileSystemFileHandle.prototype.createWritable = function (...args) {
            if (this.name === 'keystore.json') {
              FileSystemFileHandle.prototype.createWritable = create;
              return Promise.reject(new Error('Synthetic publication refusal'));
            }
            return create.apply(this, args);
          };
        });
        await page.locator('[data-list-row="passphrase"]').click();
        await page.locator('[data-access-continue]').click();
        await page.locator('#am-passphrase').fill('new synthetic protection');
        await page.locator('#am-passphrase-confirm').fill('new synthetic protection');
        await page.locator('[data-access-submit]').click();
        await page.waitForSelector('#current-protection-recovery');
        assert.equal(await page.evaluate(async () => {
          const { unlockJournalPin } = await import('/src/lib/data/journal-pin.ts');
          return (await unlockJournalPin('1234')).length;
        }), 32);
        await page.locator('#current-protection-recovery').fill('mistyped');
        await page.locator('[data-confirm-current-protection]').click();
        await page.waitForFunction(() => document.querySelector('[data-protection-status]')?.textContent.trim());
        await page.locator('#current-protection-recovery').fill(once.written);
        await page.locator('[data-confirm-current-protection]').click();
        await page.waitForSelector('[data-post-recovery-setup]', { state: 'detached' });
        const spent = await page.evaluate(async () => {
          const boot = await import('/src/lib/stores/boot.svelte.ts');
          try { await boot.changeAccessModeAfterRecovery('device-bound', '', () => {}); return false; }
          catch { return true; }
        });
        assert.equal(spent, true);
        console.log('PASS recovered session: no general mint approval; failed setup keeps old PIN; retry requires fresh existing recovery key; consumed proof cannot change access again');
      }

    } finally { await context.close(); }
  }
} finally { await browser.close(); await server.close(); }
