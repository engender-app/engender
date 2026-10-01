import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchChromium, previewBuild, settlePage } from './browser-harness.mjs';

const out = '.claude/dose-editor-copy-shots';
await mkdir(out, { recursive: true });
const app = await previewBuild(process.cwd());
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
try {
  for (const locale of ['en', 'pl']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await settlePage(page, base, '/settings', 'light');
    await page.locator('[data-list-row="language"]').click();
    await page.locator(`[data-segment="${locale}"]`).click();
    await settlePage(page, base, '/care/doses', 'light');
    await page.locator('[data-add]').click();
    await page.locator('#dose-amount').waitFor();
    assert.equal(await page.locator('[data-save-dose]').isDisabled(), true);
    assert.equal(await page.locator('#dose-amount').getAttribute('aria-invalid'), 'true');
    assert.equal(await page.locator('#dose-amount').getAttribute('aria-describedby'), 'dose-requirements');
    assert.match(await page.locator('#dose-requirements').innerText(), locale === 'en' ? /Enter a dose amount/ : /Wpisz ilość dawki/);
    for (const zoom of [1, 2]) {
      await page.evaluate((zoom) => { document.documentElement.style.zoom = String(zoom); }, zoom);
      const sheet = page.locator('[data-sheet]');
      assert.equal(await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth), true);
      await sheet.screenshot({ path: `${out}/${locale}-required-${zoom}x.png` });
    }
    await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
    await page.locator('#dose-amount').fill('6');
    await page.locator('#dose-unit').fill('mg');
    await page.locator('[data-close-record]').click();
    await page.locator('[data-keep-editing]').waitFor();
    for (const zoom of [1, 2]) {
      await page.evaluate((zoom) => { document.documentElement.style.zoom = String(zoom); }, zoom);
      assert.equal(await page.locator('[data-sheet]').last().evaluate((el) => el.scrollWidth <= el.clientWidth), true);
      await page.locator('[data-sheet]').last().screenshot({ path: `${out}/${locale}-discard-${zoom}x.png` });
    }
    await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
    await page.locator('[data-keep-editing]').click();
    await page.locator('[data-keep-editing]').waitFor({ state: 'detached' });
    await page.locator('[data-save-dose]').click();
    await page.waitForSelector('[data-sheet]', { state: 'detached' });
    await page.locator('[data-dose]').first().click();
    await page.locator('[data-delete-dose]').click();
    for (const zoom of [1, 2]) {
      await page.evaluate((zoom) => { document.documentElement.style.zoom = String(zoom); }, zoom);
      assert.equal(await page.locator('[data-sheet]').last().evaluate((el) => el.scrollWidth <= el.clientWidth), true);
      await page.locator('[data-sheet]').last().screenshot({ path: `${out}/${locale}-delete-${zoom}x.png` });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
    assert.equal(await page.locator('[data-sheet]').last().evaluate((el) => el.scrollWidth <= el.clientWidth), true);
    await page.locator('[data-sheet]').last().screenshot({ path: `${out}/${locale}-delete-desktop.png` });
    assert.deepEqual(errors, []);
    console.log(`PASS ${locale} dose requirements, discard and deletion at 390px and 200% zoom; desktop deletion`);
    await page.close();
  }
} finally {
  await browser.close();
  await app.close();
}
