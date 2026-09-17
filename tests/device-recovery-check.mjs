import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { PALETTES } from './palettes.mjs';
import { createServer, preview } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const server = await createServer({
  configFile: 'tests/browser-tier/browser-tier.vite.config.ts',
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
});
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(15000);
page.on('pageerror', (error) => console.error(error));
page.on('console', (message) => { if (message.type() === 'error') console.error(message.text()); });
try {
  await page.goto(`http://localhost:${server.config.server.port}/gates.html`);
  await page.waitForSelector('body[data-gates-ready]');
  await page.selectOption('select[aria-label="Scene"]', 'device-recovery');
  await page.locator('[data-device-recovery-none]').waitFor();
  await page.locator('[data-open-archive-recovery]').click();
  await page.locator('[data-confirm-archive-reset]').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('[data-sheet]').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('[data-open-archive-recovery]').evaluate((el) => el === document.activeElement), true);
  console.log('PASS archive recovery is reachable before reset; cancellation returns focus');
  await page.selectOption('select[aria-label="Scene"]', 'device-recovery-with-key');
  await page.locator('[data-use-recovery-key]').click();
  await page.locator('[data-open-archive-recovery]').waitFor({ state: 'hidden' });
  console.log('PASS recovery key remains directly reachable through its own route');
  if (process.argv.includes('--gallery')) {
    const out = '.claude/ui11-shots';
    await mkdir(out, { recursive: true });
    for (const locale of ['en', 'pl']) {
      await page.evaluate(async ({ path, locale }) => {
        const { setLocale } = await import(path);
        setLocale(locale, { reload: false });
      }, { path: `/@fs${process.cwd()}/src/lib/paraglide/runtime.js`, locale });
      await page.reload();
      await page.waitForSelector('body[data-gates-ready]');
      for (const scene of ['device-recovery', 'device-recovery-with-key']) {
        await page.selectOption('select[aria-label="Scene"]', scene);
        await page.locator('[data-device-bound-recovery]').waitFor();
        assert.match(await page.locator('[data-gate-title]').innerText(), locale === 'pl' ? /Ten dziennik/ : /This journal/);
        for (const palette of PALETTES) {
          await page.selectOption('select[aria-label="Palette"]', palette);
          for (const theme of ['light', 'dark']) {
            await page.selectOption('select[aria-label="Theme"]', theme);
            await page.screenshot({ path: `${out}/${locale}-${scene}-${palette}-${theme}.png` });
          }
        }
      }
      for (const width of [320, 430, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        await page.locator('[data-open-archive-recovery]').click();
        await page.locator('[data-confirm-archive-reset]').waitFor();
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${out}/${locale}-confirmation-${width}.png` });
        const button = await page.locator('[data-confirm-archive-reset]').boundingBox();
        assert.ok(button.height >= 48 && button.width >= 48);
        assert.ok(button.x >= 0 && button.x + button.width <= width + 1);
        await page.keyboard.press('Escape');
        await page.locator('[data-sheet]').waitFor({ state: 'hidden' });
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }
    console.log('PASS gallery: both recovery states, eight palettes, both themes, English and Polish, narrow and desktop confirmation');
  }
} finally {
  await browser.close();
  await server.close();
}

// Use the real app with real storage; only key loss is induced by the test.
const app = await preview({ preview: { port: 0 } });
const realBrowser = await launchChromium();
const realPage = await realBrowser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
realPage.setDefaultTimeout(30000);
realPage.on('pageerror', (error) => console.error(error));
const base = `http://localhost:${app.httpServer.address().port}`;
async function chooseFile(file) {
  const chooser = realPage.waitForEvent('filechooser');
  await realPage.locator('[data-restore-pick]').click();
  await (await chooser).setFiles(file);
}
async function openWithoutPassphrase() {
  await realPage.locator('[data-list-row="device-bound"]').click();
  await realPage.locator('[data-access-submit]').click();
  await realPage.locator('[data-next]').waitFor();
}
try {
  await realPage.goto(base);
  await realPage.locator('[data-leave-setup]').click();
  await openWithoutPassphrase();
  await realPage.locator('[data-leave-setup]').click();
  await realPage.locator('[data-home-hello]').waitFor();
  await realPage.locator('[data-nav-fab]').click();
  await realPage.locator('[data-fan-target="mood-3"]').click();
  await realPage.locator('#ed-note').fill('Recovered from the saved archive.');
  await realPage.locator('[data-save]').click();
  await realPage.locator('[data-home-log]').waitFor();
  await realPage.goto(`${base}/settings/export`);
  await realPage.locator('#exp-pass').fill('archive-proof');
  await realPage.locator('[data-export]').click();
  const downloaded = realPage.waitForEvent('download', { timeout: 120000 });
  await realPage.locator('[data-confirm-export]').click();
  const archive = await downloaded;
  const { readFile } = await import('node:fs/promises');
  const valid = { name: archive.suggestedFilename(), mimeType: 'application/octet-stream', buffer: await readFile(await archive.path()) };
  await realPage.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('engender-device-key', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('keys', 'readwrite');
        tx.objectStore('keys').clear();
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle('recovery-cancel-proof', { create: true });
    const writer = await handle.createWritable();
    await writer.write('local data must survive cancellation');
    await writer.close();
  });
  await realPage.reload();
  await realPage.locator('[data-device-bound-recovery]').waitFor();
  await realPage.locator('[data-open-archive-recovery]').click();
  assert.match(await realPage.locator('[data-sheet]').innerText(), /first deletes every entry/);
  await realPage.keyboard.press('Escape');
  await realPage.locator('[data-sheet]').waitFor({ state: 'hidden' });
  assert.equal(await realPage.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    return (await (await root.getFileHandle('recovery-cancel-proof')).getFile()).text();
  }), 'local data must survive cancellation');
  console.log('PASS cancelling replacement after real key loss leaves local files untouched');

  await realPage.locator('[data-open-archive-recovery]').click();
  await realPage.locator('[data-confirm-archive-reset]').click();
  await realPage.waitForURL('**/onboarding?restore=1');
  await realPage.locator('[data-restore-pick]').waitFor();
  assert.equal(await realPage.locator('[data-restore-start]').count(), 0);
  await chooseFile([]);
  assert.equal((await realPage.locator('[data-restore-error]').innerText()).trim(), '');
  console.log('PASS confirmed reset opens restore directly; cancelled picker permits retry');

  await chooseFile({ name: 'invalid.ttbackup', mimeType: 'application/octet-stream', buffer: Buffer.from('not an archive') });
  await realPage.locator('#ob-restore-pass').fill('archive-proof');
  await realPage.locator('[data-restore-check]').click();
  await realPage.locator('[data-restore-error="not-an-archive"]').waitFor();
  await chooseFile(valid);
  await realPage.locator('#ob-restore-pass').fill('wrong-password');
  await realPage.locator('[data-restore-check]').click();
  await realPage.locator('[data-restore-error="wrong-password"]').waitFor();
  console.log('PASS invalid archive and wrong password stay on retryable restore form');
  await realPage.locator('#ob-restore-pass').fill('archive-proof');
  await realPage.locator('[data-restore-check]').click();
  await openWithoutPassphrase();
  await realPage.locator('[data-next]').click();
  await realPage.locator('[data-permission-list]').waitFor();
  await realPage.locator('[data-next]').click();
  await realPage.locator('[data-list-row="disguise"]').waitFor();
  await realPage.locator('[data-next]').click();
  await realPage.locator('[data-finish]').click();
  await realPage.locator('[data-home-hello]').waitFor({ timeout: 120000 });
  await realPage.goto(`${base}/day/today`);
  await realPage.getByText('Recovered from the saved archive.', { exact: true }).waitFor();
  await realPage.reload();
  await realPage.getByText('Recovered from the saved archive.', { exact: true }).waitFor();
  console.log('PASS restored entry survives reopening; existing replace workflow commits successfully');
} catch (error) {
  console.error((await realPage.locator('body').innerText()).slice(-2500));
  throw error;
} finally {
  await realBrowser.close();
  await new Promise((resolve, reject) => app.httpServer.close((error) => error ? reject(error) : resolve()));
}
