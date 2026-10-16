import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { createReporter, launchChromium } from './browser-harness.mjs';

// Mount real gates with synthetic journals and real storage/authentication.
const server = await createServer({
  server: { port: 0, watch: null, fs: { allow: [process.cwd(), realpathSync('node_modules')] } },
  plugins: [{
    name: 'pin-credential-probe',
    configResolved(config) { config.server.watch = null; },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url !== '/pin-credential-peer') return next();
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><title>PIN credential peer</title>');
      });
    }
  }]
});
await server.listen();
const base = server.resolvedUrls.local[0];
const { block, ok, finish } = createReporter();
const attemptState = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('engender-pin-attempts') ?? 'null'));
const seedAttempts = (page) => page.evaluate(() => localStorage.setItem('engender-pin-attempts', JSON.stringify({ wrongAttempts: 1, acceptingFrom: 0 })));
const visibility = (page, value) => page.evaluate((value) => {
  Object.defineProperty(document, 'visibilityState', { value, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}, value);
const navigate = (page, path) => page.evaluate(async (path) => {
  const { goto } = await import('/node_modules/@sveltejs/kit/src/runtime/app/navigation.js');
  await goto(path);
}, path);

async function enterGate(page, gate) {
  if (gate === 'cold') await page.reload({ waitUntil: 'networkidle' });
  else if (gate === 'session') {
    await visibility(page, 'hidden');
    await page.waitForSelector('[data-applock]');
    await visibility(page, 'visible');
  } else {
    await navigate(page, '/settings/access-mode');
    await page.locator('[data-list-row="change-pin"]').click();
  }
  await page.waitForFunction(() => document.querySelector('[data-key="1"]')?.disabled === false);
}

async function typePin(page, pin) {
  for (const digit of pin) await page.locator(`[data-key="${digit}"]`).click();
}

async function holdCredentials(page) {
  await page.evaluate(async () => {
    const { changeCredentials } = await import('/src/lib/data/credential-ownership.ts');
    let started;
    const entered = new Promise((resolve) => { started = resolve; });
    window.pinCredentialOwner = changeCredentials(async () => {
      window.pinCredentialHeld = true;
      await new Promise((resolve) => { window.releasePinCredentials = resolve; started(); });
    });
    await entered;
  });
}

async function releaseCredentials(page) {
  await page.evaluate(async () => { window.releasePinCredentials?.(); await window.pinCredentialOwner; });
}

async function waitForSuccess(page, gate) {
  await page.waitForSelector('[data-pin-status]', { state: 'detached', timeout: 30000 });
  if (gate !== 'settings') await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
  await page.waitForFunction(() => localStorage.getItem('engender-pin-attempts') === null);
}

async function assertContent(page, fixture) {
  const saved = await page.evaluate(async (fixture) => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    const { readPhoto } = await import('/src/lib/stores/photoFiles.ts');
    return { note: (await journal.entries.getEntry(fixture.entryId)).note, bytes: Array.from(await readPhoto(fixture.fileName)) };
  }, fixture);
  assert.deepEqual(saved, { note: fixture.note, bytes: fixture.bytes });
}

let browser;
try {
  browser = await launchChromium();
  await block('Real browser key slots', 6, async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(`${base}pin-credential-peer`);
      const missing = await page.evaluate(async () => {
        const { browserKeySlot } = await import('/src/lib/data/device-bound-journal.ts');
        const { browserDeviceBinding, DeviceBindingUnavailableError, PIN_BINDING_SLOT } = await import('/src/lib/data/device-secret.ts');
        const slot = browserKeySlot(PIN_BINDING_SLOT);
        let typed = false;
        try { await browserDeviceBinding().read(); }
        catch (error) { typed = error instanceof DeviceBindingUnavailableError; }
        return { missing: await slot.load() === null, typed };
      });
      assert.deepEqual(missing, { missing: true, typed: true });
      ok('a fresh IndexedDB slot is null and binding read refuses without minting');

      const present = await page.evaluate(async () => {
        const { browserKeySlot } = await import('/src/lib/data/device-bound-journal.ts');
        const { browserDeviceBinding, PIN_BINDING_SLOT } = await import('/src/lib/data/device-secret.ts');
        const binding = browserDeviceBinding();
        const secret = await binding.create();
        const key = await browserKeySlot(PIN_BINDING_SLOT).load();
        const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('engender/pin-binding/v1')));
        let exportRefused = false;
        try { await crypto.subtle.exportKey('raw', key); } catch { exportRefused = true; }
        return { extractable: key.extractable, signs: btoa(String.fromCharCode(...bytes)) === secret, stable: await binding.read() === secret, exportRefused };
      });
      assert.deepEqual(present, { extractable: false, signs: true, stable: true, exportRefused: true });
      ok('a persisted non-extractable HMAC key loads and signs the same secret');

      const removed = await page.evaluate(async () => {
        const { browserKeySlot } = await import('/src/lib/data/device-bound-journal.ts');
        const { browserDeviceBinding, DeviceBindingUnavailableError, PIN_BINDING_SLOT } = await import('/src/lib/data/device-secret.ts');
        const slot = browserKeySlot(PIN_BINDING_SLOT);
        await slot.remove();
        let typed = false;
        try { await browserDeviceBinding().read(); }
        catch (error) { typed = error instanceof DeviceBindingUnavailableError; }
        return { missing: await slot.load() === null, typed };
      });
      assert.deepEqual(removed, { missing: true, typed: true });
      ok('a deleted IndexedDB binding is null and keeps its typed missing-key error');

      const deviceBound = await page.evaluate(async () => {
        const { browserKeySlot, createDeviceBoundMetadata, unlockDeviceBoundMetadata, DeviceBoundKeyUnavailableError } = await import('/src/lib/data/device-bound-journal.ts');
        const slot = browserKeySlot('journal-device-key');
        const { dataKey, metadata } = await createDeviceBoundMetadata(slot);
        const opened = await unlockDeviceBoundMetadata(metadata, slot);
        await slot.remove();
        let typed = false;
        try { await unlockDeviceBoundMetadata(metadata, slot); }
        catch (error) { typed = error instanceof DeviceBoundKeyUnavailableError; }
        return { opened: Array.from(opened), expected: Array.from(dataKey), missing: await slot.load() === null, typed };
      });
      assert.deepEqual(deviceBound.opened, deviceBound.expected);
      assert.equal(deviceBound.missing, true);
      assert.equal(deviceBound.typed, true);
      ok('device-bound metadata still opens with its key and refuses typed loss without replacement');

      const legacy = await page.evaluate(async () => {
        const { setupJournalPin, unlockJournalPin } = await import('/src/lib/data/journal-pin.ts');
        const { KEYSTORE_FILE, readKeystoreFile } = await import('/src/lib/data/keystore-file.ts');
        const { browserDeviceBinding } = await import('/src/lib/data/device-secret.ts');
        const { changeCredentials } = await import('/src/lib/data/credential-ownership.ts');
        const dataKey = await setupJournalPin('1234');
        const root = await navigator.storage.getDirectory();
        const file = await root.getFileHandle(KEYSTORE_FILE);
        const metadata = JSON.parse(await (await file.getFile()).text());
        delete metadata.pinBinding;
        // Seed the older persisted format; current writers require the binding name.
        const serialized = JSON.stringify(metadata);
        await changeCredentials(async () => {
          const writable = await file.createWritable();
          await writable.write(serialized);
          await writable.close();
        });
        const secret = await browserDeviceBinding().read();
        const opened = await unlockJournalPin('1234');
        return { opened: Array.from(opened), expected: Array.from(dataKey), sameBinding: await browserDeviceBinding().read() === secret, browserBinding: (await readKeystoreFile()).pinBinding === 'browser', unchanged: await (await file.getFile()).text() === serialized };
      });
      assert.deepEqual(legacy.opened, legacy.expected);
      assert.equal(legacy.sameBinding, true);
      assert.equal(legacy.browserBinding, true);
      assert.equal(legacy.unchanged, true);
      ok('a legacy PIN wrap without pinBinding opens through the same real browser binding');

      const legacyMissing = await page.evaluate(async () => {
        const { unlockJournalPin } = await import('/src/lib/data/journal-pin.ts');
        const { browserKeySlot } = await import('/src/lib/data/device-bound-journal.ts');
        const { readKeystoreFile } = await import('/src/lib/data/keystore-file.ts');
        const { DeviceBindingUnavailableError, PIN_BINDING_SLOT } = await import('/src/lib/data/device-secret.ts');
        const { changeCredentials } = await import('/src/lib/data/credential-ownership.ts');
        const slot = browserKeySlot(PIN_BINDING_SLOT);
        const before = JSON.stringify(await readKeystoreFile());
        await changeCredentials(() => slot.remove());
        let typed = false;
        try { await unlockJournalPin('1234'); }
        catch (error) { typed = error instanceof DeviceBindingUnavailableError; }
        return { missing: await slot.load() === null, typed, unchanged: JSON.stringify(await readKeystoreFile()) === before };
      });
      assert.deepEqual(legacyMissing, { missing: true, typed: true, unchanged: true });
      ok('unlocking a legacy PIN with its binding gone creates no replacement or wrap');
    } finally { await context.close(); }
  });
  const gates = process.argv.includes('--adapter-only') ? [] : ['cold', 'session', 'settings'];
  for (const locale of ['en', 'pl']) for (const gate of gates) {
    await block(`PIN ${gate}: ${locale}`, 15, async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale });
      await context.addInitScript((locale) => localStorage.setItem('PARAGLIDE_LOCALE', locale), locale);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.setDefaultTimeout(30000);
      try {
        await page.goto(base, { waitUntil: 'networkidle' });
        await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
        if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
        const fixture = await page.evaluate(async () => {
          const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
          const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
          const { changeAccessMode } = await import('/src/lib/stores/boot.svelte.ts');
          const { unlockJournalPin } = await import('/src/lib/data/journal-pin.ts');
          const { mintRecoveryKey } = await import('/src/lib/data/recovery-key.ts');
          const { readPhoto } = await import('/src/lib/stores/photoFiles.ts');
          const { opfsPhotoFiles } = await import('/src/lib/data/photos/opfs-file-store.ts');
          prefs.lockAfter = 'immediately';
          const note = 'Synthetic PIN contention entry';
          const bytes = new TextEncoder().encode('Synthetic PIN encrypted attachment');
          const entryId = await journal.entries.upsertEntry({ epochDay: 20000, mood: 3, note, attachPhotos: [{ full: bytes, thumb: bytes }] });
          const fileName = (await journal.entries.getEntry(entryId)).photos[0].fileName;
          await changeAccessMode('pin', '1234');
          await mintRecoveryKey(await unlockJournalPin('1234'));
          return { entryId, fileName, note, bytes: Array.from(bytes), encrypted: Array.from(await opfsPhotoFiles().read(fileName)), read: Array.from(await readPhoto(fileName)) };
        });
        assert.deepEqual(fixture.read, fixture.bytes);
        assert.notDeepEqual(fixture.encrypted, fixture.bytes);
        ok('fixture keeps a real encrypted entry and attachment');

        await seedAttempts(page);
        await enterGate(page, gate);
        const before = await attemptState(page);
        await holdCredentials(page);
        await typePin(page, '1234');
        await page.waitForSelector('[data-pin-status="busy"]');
        assert.deepEqual(await attemptState(page), before);
        ok('correct PIN waits without recording a wrong attempt');
        const mutation = await page.evaluate(async () => {
          const { changeCredentials } = await import('/src/lib/data/credential-ownership.ts');
          try { await changeCredentials(async () => { window.pinMutationOverlapped = true; }); return 'resolved'; }
          catch (error) { return error.name; }
        });
        assert.equal(mutation, 'CredentialsBusyError');
        assert.equal(await page.evaluate(() => !!window.pinMutationOverlapped), false);
        ok('held credentials exclude a competing mutation');
        const busyText = await page.evaluate(async () => (await import('/src/lib/paraglide/messages.js')).m.pp_decrypting());
        await page.waitForFunction((text) => document.querySelector('[data-announce]')?.textContent.trim() === text, busyText);
        assert.equal((await page.locator('[data-pin-status]').textContent()).trim(), busyText, 'visible busy status');
        assert.equal((await page.locator('[data-announce]').textContent()).trim(), busyText);
        assert.ok(!(await page.locator('[data-pin-pad]').ariaSnapshot()).includes('1234'));
        ok('busy feedback is visible and announced without exposing digits');
        await releaseCredentials(page);
        await waitForSuccess(page, gate);
        await assertContent(page, fixture);
        ok('released ownership authenticates and preserves journal bytes');

        if (gate === 'settings') await navigate(page, '/settings/security');
        await seedAttempts(page);
        await enterGate(page, gate);
        await typePin(page, '4321');
        await page.waitForSelector('[data-pin-status="throttled"]');
        assert.equal((await attemptState(page)).wrongAttempts, 2);
        assert.ok((await page.locator('[data-pin-status]').textContent()).trim());
        await page.waitForFunction(() => document.querySelector('[data-key="1"]')?.disabled === false);
        ok('one genuine wrong PIN records one failure and the existing delay');

        const peer = await context.newPage();
        await peer.goto(`${base}pin-credential-peer`);
        await peer.evaluate(async () => {
          const { unlockJournalPin } = await import('/src/lib/data/journal-pin.ts');
          const { readKeystoreFile, writeKeystoreFile } = await import('/src/lib/data/keystore-file.ts');
          const { wrapDataKeyWithSecret } = await import('/src/lib/crypto/keystore.ts');
          const { changeCredentials } = await import('/src/lib/data/credential-ownership.ts');
          const dataKey = await unlockJournalPin('1234');
          window.savedPinMetadata = await readKeystoreFile();
          await changeCredentials(async () => writeKeystoreFile(await wrapDataKeyWithSecret(dataKey, 'synthetic changed passphrase')));
        });
        const beforeStale = await attemptState(page);
        await typePin(page, '1234');
        await page.waitForSelector('[data-pin-status="access-unavailable"]');
        assert.deepEqual(await attemptState(page), beforeStale);
        const unavailableText = await page.evaluate(async () => (await import('/src/lib/paraglide/messages.js')).m.pin_access_unavailable());
        await page.waitForFunction((text) => document.querySelector('[data-announce-urgent]')?.textContent.trim() === text, unavailableText);
        assert.equal((await page.locator('[data-pin-status]').textContent()).trim(), unavailableText);
        assert.equal((await page.locator('[data-announce-urgent]').textContent()).trim(), unavailableText);
        ok('another tab changing the wrap gives reload guidance without a wrong attempt');
        await peer.evaluate(async () => {
          const { removeKeystoreFile } = await import('/src/lib/data/keystore-file.ts');
          const { changeCredentials } = await import('/src/lib/data/credential-ownership.ts');
          await changeCredentials(removeKeystoreFile);
        });
        await typePin(page, '1234');
        await page.waitForSelector('[data-pin-status="access-unavailable"]');
        assert.deepEqual(await attemptState(page), beforeStale);
        ok('a missing keystore also stays outside wrong-PIN accounting');
        const geometry = await page.evaluate(() => {
          document.documentElement.style.zoom = '2';
          const status = document.querySelector('[data-pin-status]');
          return { width: status.clientWidth, overflow: status.scrollWidth > status.clientWidth + 1, text: status.textContent.trim() };
        });
        assert.ok(geometry.width > 0);
        assert.equal(geometry.overflow, false);
        assert.equal(geometry.text, unavailableText);
        await page.evaluate(() => { document.documentElement.style.zoom = ''; });
        ok('catalogued error copy wraps at 390px with 200% CSS zoom');
        await peer.evaluate(async () => {
          const { writeKeystoreFile } = await import('/src/lib/data/keystore-file.ts');
          const { changeCredentials } = await import('/src/lib/data/credential-ownership.ts');
          await changeCredentials(() => writeKeystoreFile(window.savedPinMetadata));
        });
        await typePin(page, '1234');
        await waitForSuccess(page, gate);
        if (gate === 'settings') await navigate(page, '/settings/security');
        await seedAttempts(page);
        await enterGate(page, gate);
        const beforeCancel = await attemptState(page);
        await holdCredentials(page);
        await typePin(page, '1234');
        await page.waitForSelector('[data-pin-status="busy"]');
        if (gate === 'cold') await page.locator('[data-use-recovery-key]').click();
        else if (gate === 'settings') await navigate(page, '/settings/security');
        else await visibility(page, 'hidden');
        await releaseCredentials(page);
        await page.waitForFunction(() => document.querySelector('[data-pin-status]')?.dataset.pinStatus !== 'busy');
        if (gate !== 'settings') {
          const locked = await page.evaluate(async () => {
            const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
            const { lockState } = await import('/src/lib/stores/lock.svelte.ts');
            return { unlocked: lockState.unlocked, journal: !!bootState.journal };
          });
          assert.deepEqual(locked, { unlocked: false, journal: false });
        } else assert.ok(page.url().endsWith('/settings/security'));
        assert.deepEqual(await attemptState(page), beforeCancel);
        ok('leaving or locking cancels queued publication without changing attempts');
        if (gate === 'cold') await page.reload({ waitUntil: 'networkidle' });
        else if (gate === 'settings') await enterGate(page, gate);
        else await visibility(page, 'visible');
        await page.waitForFunction(() => document.querySelector('[data-key="1"]')?.disabled === false);
        await typePin(page, '1234');
        await waitForSuccess(page, gate);
        await assertContent(page, fixture);
        ok('a fresh correct attempt opens unchanged content after cancellation');

        if (gate === 'settings') await navigate(page, '/settings/security');
        await seedAttempts(page);
        await enterGate(page, gate);
        const beforeMissing = await attemptState(page);
        const bindingLoss = await page.evaluate(async () => {
          const { browserKeySlot } = await import('/src/lib/data/device-bound-journal.ts');
          const { unlockJournalPin } = await import('/src/lib/data/journal-pin.ts');
          const { DeviceBindingUnavailableError, PIN_BINDING_SLOT } = await import('/src/lib/data/device-secret.ts');
          const { changeCredentials } = await import('/src/lib/data/credential-ownership.ts');
          const slot = browserKeySlot(PIN_BINDING_SLOT);
          window.savedPinBindingKey = await slot.load();
          await changeCredentials(() => slot.remove());
          let typed = false;
          try { await unlockJournalPin('1234'); }
          catch (error) { typed = error instanceof DeviceBindingUnavailableError; }
          return { missing: await slot.load() === null, typed };
        });
        assert.deepEqual(bindingLoss, { missing: true, typed: true });
        ok('real PIN unlock reports typed loss after deleting the actual IndexedDB binding');
        await typePin(page, '1234');
        await page.waitForSelector('[data-pin-status="device-gone"]');
        assert.deepEqual(await attemptState(page), beforeMissing);
        const lostText = await page.evaluate(async () => (await import('/src/lib/paraglide/messages.js')).m.su_device_key_gone());
        await page.waitForFunction((text) => document.querySelector('[data-announce-urgent]')?.textContent.trim() === text, lostText);
        assert.equal((await page.locator('[data-pin-status]').textContent()).trim(), lostText);
        assert.equal(await page.evaluate(async () => {
          const { browserKeySlot } = await import('/src/lib/data/device-bound-journal.ts');
          const { PIN_BINDING_SLOT } = await import('/src/lib/data/device-secret.ts');
          return await browserKeySlot(PIN_BINDING_SLOT).load() === null;
        }), true);
        ok('key-loss guidance is visible and announced without counting or minting a binding');
        await page.evaluate(async () => {
          const { browserKeySlot } = await import('/src/lib/data/device-bound-journal.ts');
          const { PIN_BINDING_SLOT } = await import('/src/lib/data/device-secret.ts');
          const { changeCredentials } = await import('/src/lib/data/credential-ownership.ts');
          await changeCredentials(() => browserKeySlot(PIN_BINDING_SLOT).save(window.savedPinBindingKey));
          window.savedPinBindingKey = null;
        });
        await typePin(page, '1234');
        await waitForSuccess(page, gate);
        await assertContent(page, fixture);
        ok('restoring only the synthetic original key opens the unchanged encrypted journal');
        assert.deepEqual(errors, []);
        ok('all mounted paths complete without uncaught page errors');
      } finally {
        await releaseCredentials(page).catch(() => {});
        await context.close();
      }
    });
  }
} finally {
  await browser?.close();
  await server.close();
}
finish('PIN credential contention regression passed');
