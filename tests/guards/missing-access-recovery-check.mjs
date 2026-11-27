/* Missing access wraps must not turn retained ciphertext into a first run.
   Uses real OPFS/SQLite and the production boot/setup/recovery owners. */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium } from '../browser-harness.mjs';
import { firstRun, choosePassphrase } from '../browser-tier/built-flow.mjs';

const server = await createServer({
  define: { __DEMO__: 'false' },
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
});
await server.listen();
const browser = await launchChromium();
const origin = server.resolvedUrls.local[0];
const errors = [];
const pass = (label) => console.log(`PASS ${label}`);

async function seed(page, recovery) {
  return page.evaluate(async (recovery) => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    const { journalDataKey } = await import('/src/lib/stores/boot.svelte.ts');
    const keys = await import('/src/lib/data/recovery-key.ts');
    const id = await journal.entries.upsertEntry({ epochDay: 20000, mood: 4, note: 'retained journal fixture' });
    await journal.entries.upsertEntry({ epochDay: 20001, mood: 3, note: 'second retained entry' });
    const canvas = document.createElement('canvas'); canvas.width = 20; canvas.height = 20;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f5a9b8'; ctx.fillRect(0, 0, 20, 20);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await journal.photos.attach({ entryId: id }, { full: bytes, thumb: bytes });
    if (recovery === 'none' || recovery === 'unreadable') return null;
    const key = await keys.mintRecoveryKey(await journalDataKey());
    if (recovery === 'active' || recovery.startsWith('device-')) await keys.finishRecoveryKey(key);
    return key;
  }, recovery);
}

async function contents(page) {
  return page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    const { readPhoto } = await import('/src/lib/stores/photoFiles.ts');
    const photos = await journal.photos.inJournal();
    const hashes = [];
    for (const photo of photos) {
      const bytes = await readPhoto(photo.fileName);
      if (!bytes) throw new Error('retained photo missing');
      hashes.push(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join(''));
    }
    return { entries: await journal.entries.countAll(), photos: photos.length, hashes };
  });
}

async function loseAccess(page, malformed, recovery) {
  return page.evaluate(async ({ malformed, recovery }) => {
    const root = await navigator.storage.getDirectory();
    if (malformed) {
      const file = await root.getFileHandle('keystore.json');
      const write = await file.createWritable(); await write.write('{broken'); await write.close();
    } else await root.removeEntry('keystore.json');
    if (recovery.startsWith('device-')) {
      const file = await root.getFileHandle('device-key.json', { create: true });
      const write = await file.createWritable();
      await write.write(recovery === 'device-null' ? 'null' : JSON.stringify({ version: 1, kind: 'device-bound', nonce: '!', wrappedKey: 'AA==' }));
      await write.close();
    }
    if (recovery === 'unreadable') {
      const file = await root.getFileHandle('recovery-key.json', { create: true });
      const write = await file.createWritable(); await write.write('{broken'); await write.close();
    }
    const { setupJournalPassphrase } = await import('/src/lib/data/journal-passphrase.ts');
    let refused = false;
    try { await setupJournalPassphrase('must not create this key'); }
    catch (error) { refused = error.name === 'JournalAlreadyExistsError'; }
    const files = []; for await (const name of root.keys()) files.push(name);
    return { refused, hasAccess: files.includes('keystore.json') };
  }, { malformed, recovery });
}

async function assertGate(page, missingAccess = true) {
  await page.locator('[data-app-root][data-boot="needs-device-recovery"]').waitFor({ state: 'attached' });
  await page.locator('[data-device-bound-recovery]').waitFor();
  assert.match(await page.locator('[data-gate-title]').innerText(), missingAccess ? /needs recovery/ : /tied to this device/);
  assert.equal(await page.locator('[data-home-hello], [data-app-rail], [data-entry-card], [data-next]').count(), 0);
  assert.equal(await page.getByText('retained journal fixture', { exact: true }).count(), 0);
}

try {
  for (const recovery of ['active', 'pending', 'none', 'unreadable', 'device-null', 'device-base64']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: recovery === 'active' ? 'no-preference' : 'reduce' });
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', e => errors.push(e.message));
    await firstRun(page, origin);
    pass(`${recovery}: genuine fresh install reaches onboarding and creates its first journal`);
    const key = await seed(page, recovery);
    const before = await contents(page);
    assert.equal(before.entries, 2); assert.equal(before.photos, 1);
    if (recovery === 'none') {
      await page.evaluate(async () => {
        const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
        prefs.disguise = true;
      });
    }
    const malformed = recovery === 'pending' || recovery === 'unreadable';
    assert.deepEqual(await loseAccess(page, malformed, recovery), { refused: true, hasAccess: malformed });
    pass(`${recovery}: stale setup refuses key creation with retained ciphertext`);
    await page.reload({ waitUntil: 'networkidle' });
    await assertGate(page, !recovery.startsWith('device-'));
    pass(`${recovery}: cold boot offers recovery without journal data or Welcome`);
    if (recovery === 'none') {
      assert.equal(await page.locator('[data-flag-sun], [data-app-wordmark]').count(), 0);
      assert.doesNotMatch(await page.locator('[data-gate-title]').innerText(), /Engender/);
      pass('disguise keeps the missing-access gate neutral');
    }
    await page.locator('[data-open-archive-recovery]').click();
    await page.locator('[data-confirm-archive-reset]').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('[data-sheet]').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('[data-open-archive-recovery]').evaluate(el => el === document.activeElement), true);
    pass(`${recovery}: Archive requires confirmation and cancellation restores focus`);
    if (key) {
      await page.locator('[data-use-recovery-key]').click();
      await page.locator('#journal-recovery-key').fill(key);
      await page.locator('[data-submit-recovery-key]').click();
      await page.locator('[data-post-recovery-setup]').waitFor();
      assert.equal(await page.locator('[data-home-hello]').count(), 0);
      await choosePassphrase(page, 'recovered journal passphrase', false);
      await page.locator('[data-home-hello]').waitFor();
      assert.deepEqual(await contents(page), before);
      pass(`${recovery}: recovery preserves entry/photo counts and decrypted media hashes, then requires a new access mode`);
      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('#journal-passphrase').fill('recovered journal passphrase');
      await page.locator('[data-passphrase-submit]').click();
      await page.locator('[data-home-hello]').waitFor();
      assert.deepEqual(await contents(page), before);
      pass(`${recovery}: new access survives another cold boot with identical contents`);
    } else {
      await page.locator('[data-device-recovery-none]').waitFor();
      assert.equal(await page.locator('[data-use-recovery-key]').count(), 0);
      assert.match(await page.locator('[data-device-recovery-none]').innerText(), /No usable recovery key/);
      await page.locator('[data-open-device-reset]').click();
      await page.locator('[data-confirm-device-reset]').waitFor();
      await page.keyboard.press('Escape');
      await page.locator('[data-sheet]').waitFor({ state: 'hidden' });
      await assertGate(page);
      await page.locator('[data-open-device-reset]').click();
      await page.locator('[data-confirm-device-reset]').click();
      await page.locator('[data-next]').waitFor();
      const pools = await page.evaluate(async () => {
        const names = []; for await (const name of (await navigator.storage.getDirectory()).keys()) if (name.startsWith('mc-pool-')) names.push(name);
        return names;
      });
      assert.deepEqual(pools, []);
      pass(`${recovery}: explicit reset removes retained pool and returns to fresh onboarding`);
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  pass('no uncaught page errors');
} finally {
  await browser.close();
  await server.close();
}
