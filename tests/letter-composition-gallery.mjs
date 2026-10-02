import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchChromium, previewBuild, settlePage } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const out = '.claude/letter-shots';
await mkdir(out, { recursive: true });
const app = await previewBuild(process.cwd());
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
let shots = 0;
const errors = [];
async function capture(page, name) {
  const sheet = page.locator('[data-sheet]').last();
  assert.equal(await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth), true, name);
  await sheet.screenshot({ path: `${out}/${name}.png` });
  shots++;
}
try {
  for (const locale of ['en', 'pl']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page.on('pageerror', (error) => errors.push(error.message));
    await settlePage(page, base, '/settings', 'light');
    await page.locator('[data-list-row="language"]').click();
    await page.locator(`[data-segment="${locale}"]`).click();
    await settlePage(page, base, '/transition/letters', 'light');
    await page.locator('[data-add]').click();
    for (const zoom of [1, 2]) {
      await page.evaluate((zoom) => { document.documentElement.style.zoom = String(zoom); }, zoom);
      await capture(page, `${locale}-requirements-${zoom}x`);
    }
    await page.locator('#letter-text').fill('A letter to my future self. '.repeat(20));
    await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
    if (locale === 'en') {
      for (const palette of PALETTES) for (const theme of ['light', 'dark']) {
        await page.locator('[data-close-record]').click();
        await page.locator('[data-discard-record]').click();
        await page.waitForSelector('[data-sheet]', { state: 'detached' });
        await settlePage(page, base, '/settings', theme);
        await page.locator(`[data-palette-pick="${palette}"]`).click();
        await page.locator(`[data-segment="${theme}"]`).first().click();
        await settlePage(page, base, '/transition/letters', theme);
        await page.locator('[data-add]').click();
        await page.locator('#letter-text').fill('A letter to my future self. '.repeat(20));
        await capture(page, `${palette}-${theme}-compose`);
        await page.locator('[data-close-record]').click();
        await capture(page, `${palette}-${theme}-discard`);
        for (const selector of ['[data-keep-editing]', '[data-discard-record]']) {
          const box = await page.locator(selector).boundingBox();
          assert.ok(box.width >= 48 && box.height >= 48);
        }
        await page.locator('[data-keep-editing]').click();
        await page.locator('[data-keep-editing]').waitFor({ state: 'detached' });
      }
    }
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const zoom of [1, 2]) {
        await page.evaluate((zoom) => { document.documentElement.style.zoom = String(zoom); }, zoom);
        await capture(page, `${locale}-${width}-${zoom}x-compose`);
        await page.locator('[data-close-record]').click();
        await capture(page, `${locale}-${width}-${zoom}x-discard`);
        await page.locator('[data-keep-editing]').click();
        await page.locator('[data-keep-editing]').waitFor({ state: 'detached' });
      }
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(`PASS ${shots} letter shots: ${PALETTES.length} palettes, both themes, English/Polish, 390px, 200% zoom and desktop`);
} finally {
  await browser.close();
  await app.close();
}
