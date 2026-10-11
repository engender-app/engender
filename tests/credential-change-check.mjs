import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { createReporter, launchBrowser, newCapabilityContext } from './browser-harness.mjs';

// Real app, crypto and storage; delay only the first credential publication.
const server = await createServer({
  server: { port: 0, watch: null, fs: { allow: [process.cwd(), realpathSync(resolve('node_modules'))] } },
  plugins: [{
    name: 'credential-change-probe',
    configResolved(config) { config.server.watch = null; },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url !== '/credential-change-peer') return next();
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><title>Credential ownership probe</title>');
      });
    }
  }]
});
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await launchBrowser();
const { block, ok, finish } = createReporter();

async function visibility(page, value) {
  await page.evaluate(value => {
    Object.defineProperty(document, 'visibilityState', { value, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, value);
}

async function selectPin(page, pin) {
  await page.locator('[data-list-row="pin"]').click();
  await page.locator('[data-access-continue]').click();
  await page.waitForSelector('[data-access-secret="pin"]');
  for (const digit of pin + pin) await page.locator(`[data-key="${digit}"]`).click();
}

async function credentialState(page, fileName) {
  return page.evaluate(async fileName => {
    const { browserDeviceBinding } = await import('/src/lib/data/device-secret.ts');
    const { opfsPhotoFiles } = await import('/src/lib/data/photos/opfs-file-store.ts');
    const root = await navigator.storage.getDirectory();
    return {
      metadata: await (await (await root.getFileHandle('keystore.json')).getFile()).text(),
      binding: await browserDeviceBinding().read(),
      attachment: Array.from(await opfsPhotoFiles().read(fileName))
    };
  }, fileName);
}

try {
  await block('credential changes retain ownership across lock and remount', 10, async () => {
    const context = await newCapabilityContext(browser);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(base, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
      if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
      const fixture = await page.evaluate(async () => {
        const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
        const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
        const { readPhoto } = await import('/src/lib/stores/photoFiles.ts');
        const { opfsPhotoFiles } = await import('/src/lib/data/photos/opfs-file-store.ts');
        prefs.lockAfter = 'immediately';
        const groups = await journal.tags.getTagGroups();
        await journal.tags.addTag(groups[0].key, 'Synthetic credential ownership tag');
        const bytes = new TextEncoder().encode('Synthetic encrypted attachment');
        const entryId = await journal.entries.upsertEntry({
          epochDay: 20000, mood: 3, note: 'Synthetic credential ownership entry',
          attachPhotos: [{ full: bytes, thumb: bytes }]
        });
        const entry = await journal.entries.getEntry(entryId);
        const fileName = entry.photos[0].fileName;
        return {
          entryId, fileName, bytes: Array.from(bytes),
          decrypted: Array.from(await readPhoto(fileName)),
          encrypted: Array.from(await opfsPhotoFiles().read(fileName))
        };
      });
      assert.deepEqual(fixture.decrypted, fixture.bytes);
      assert.notDeepEqual(fixture.encrypted, fixture.bytes);
      ok('fixture uses encrypted attachment storage and a committed journal entry');

      await page.evaluate(() => {
        const create = FileSystemFileHandle.prototype.createWritable;
        FileSystemFileHandle.prototype.createWritable = async function (...args) {
          if (this.name !== 'keystore.json') return create.apply(this, args);
          FileSystemFileHandle.prototype.createWritable = create;
          window.credentialWriteHeld = true;
          await new Promise(resolve => { window.releaseCredentialWrite = resolve; });
          const writable = await create.apply(this, args);
          const close = writable.close.bind(writable);
          writable.close = async () => { await close(); window.credentialWriteCommitted = true; };
          return writable;
        };
      });
      await page.evaluate(async () => {
        const { goto } = await import('/node_modules/@sveltejs/kit/src/runtime/app/navigation.js');
        await goto('/settings/access-mode');
      });
      await selectPin(page, '1234');
      await page.waitForFunction(() => window.credentialWriteHeld);
      const heldState = await credentialState(page, fixture.fileName);

      const peer = await context.newPage();
      await peer.goto(`${base}credential-change-peer`);
      peer.on('pageerror', error => errors.push(error.message));
      const rejected = await peer.evaluate(async () => {
        const { changeAccessMode, resetApp } = await import('/src/lib/stores/boot.svelte.ts');
        const outcomes = [];
        for (const operation of [() => changeAccessMode('pin', '9876'), () => resetApp()]) {
          try { await operation(); outcomes.push('resolved'); }
          catch (error) { outcomes.push(error.name); }
        }
        return outcomes;
      });
      assert.equal(rejected[0], 'CredentialsBusyError');
      assert.deepEqual(await credentialState(page, fixture.fileName), heldState);
      ok('another page cannot mutate credentials or attachment bytes while ownership is held');
      assert.equal(rejected[1], 'CredentialsBusyError');
      assert.deepEqual(await credentialState(peer, fixture.fileName), heldState);
      ok('another page cannot reset the journal while credential publication is held');

      const reset = await page.evaluate(async () => {
        const { resetApp } = await import('/src/lib/stores/boot.svelte.ts');
        try { await resetApp(); return 'resolved'; }
        catch (error) { return error.name; }
      });
      assert.equal(reset, 'CredentialsBusyError');
      assert.deepEqual(await credentialState(page, fixture.fileName), heldState);
      ok('the owning page also rejects reset before changing durable state');

      await visibility(page, 'hidden');
      await page.waitForSelector('[data-applock]');
      await visibility(page, 'visible');
      await page.locator('#session-passphrase').fill('demo');
      await page.locator('[data-session-submit]').click();
      await page.waitForSelector('[data-applock]', { state: 'detached', timeout: 30000 });
      assert.equal(await page.locator('[data-list-row="pin"]').isEnabled(), true);
      ok('lock and successful unlock remount an enabled Settings form');

      await selectPin(page, '5678');
      await page.waitForFunction(() => document.querySelector('[data-access-status]')?.textContent.trim());
      assert.equal(await page.locator('[data-key="1"]').isEnabled(), true);
      assert.deepEqual(await credentialState(page, fixture.fileName), heldState);
      ok('the remounted form reports refusal without replacing the first binding or wrap');

      await page.evaluate(() => window.releaseCredentialWrite());
      await page.waitForFunction(() => window.credentialWriteCommitted);
      await page.waitForURL('**/settings/security');
      const committed = await credentialState(page, fixture.fileName);
      assert.notEqual(committed.metadata, heldState.metadata);
      assert.equal(committed.binding, heldState.binding);
      assert.deepEqual(committed.attachment, fixture.encrypted);
      ok('the original change commits its matching wrap and binding without rewriting attachments');

      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('[data-pin-pad]');
      for (const digit of '1234') await page.locator(`[data-key="${digit}"]`).click();
      await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
      const recovered = await page.evaluate(async fixture => {
        const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
        const { readPhoto } = await import('/src/lib/stores/photoFiles.ts');
        const groups = await journal.tags.getTagGroups();
        const entry = await journal.entries.getEntry(fixture.entryId);
        return {
          tag: groups.flatMap(group => group.tags).some(tag => tag.label === 'Synthetic credential ownership tag'),
          note: entry.note, fileName: entry.photos[0].fileName,
          bytes: Array.from(await readPhoto(fixture.fileName))
        };
      }, fixture);
      assert.equal(recovered.tag, true);
      assert.equal(recovered.note, 'Synthetic credential ownership entry');
      assert.equal(recovered.fileName, fixture.fileName);
      assert.deepEqual(recovered.bytes, fixture.bytes);
      ok('after restart the first PIN opens the original SQL content and encrypted attachment');

      const rejectedPin = await page.evaluate(async () => {
        const { unlockJournalPin } = await import('/src/lib/data/journal-pin.ts');
        try { await unlockJournalPin('5678'); return false; } catch { return true; }
      });
      assert.equal(rejectedPin, true);
      ok('the rejected replacement PIN never becomes an unlocking credential');
      assert.deepEqual(errors, []);
      ok('the held-write and refused-operation paths cause no uncaught page errors');
    } finally {
      await page.evaluate(() => window.releaseCredentialWrite?.()).catch(() => {});
      await context.close();
    }
  });
} finally {
  await browser.close();
  await server.close();
}
finish('Credential change regression passed');
