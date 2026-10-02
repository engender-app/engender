import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchChromium, previewBuild, settlePage } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const out = '.claude/regimen-shots';
await mkdir(out, { recursive: true });
const app = await previewBuild(process.cwd());
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const errors = [];
let shots = 0;
async function capture(page, name) {
  const sheet = page.locator('[data-sheet]').last();
  await sheet.screenshot({ path: `${out}/${name}.png` });
  const fits = await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth);
  if (!fits) console.error(name, await sheet.evaluate((el) => [...el.querySelectorAll('*')].filter((child) => child.getBoundingClientRect().right > el.getBoundingClientRect().right + 1).map((child) => ({ tag: child.tagName, class: child.className, text: child.textContent?.slice(0, 65), width: child.getBoundingClientRect().width })).slice(0, 15)));
  assert.equal(fits, true, name);
  shots++;
}
async function groups(page, name) {
  for (const [group, selector] of [['episode', '#regimen-drug'], ['schedule', '#regimen-every'], ['actions', '[data-new-pause]']]) {
    await page.locator(selector).evaluate((el) => {
      const sheet = el.closest('[data-sheet]');
      sheet.scrollTop += el.closest('section').getBoundingClientRect().top - sheet.getBoundingClientRect().top - 20;
    });
    await capture(page, `${name}-${group}`);
  }
}
try {
  for (const locale of (process.argv.includes('--pl-only') ? ['pl'] : ['en', 'pl'])) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page.on('pageerror', (error) => errors.push(error.message));
    await settlePage(page, base, '/settings', 'light');
    await page.locator('[data-list-row="language"]').click();
    await page.locator(`[data-segment="${locale}"]`).click();
    await settlePage(page, base, '/care/regimen', 'light');
    await page.locator('[data-add]').click();
    await page.locator('[data-own]').click();
    assert.equal(await page.locator('[data-save-regimen]').isDisabled(), true);
    assert.equal(await page.locator('#regimen-drug').getAttribute('aria-invalid'), 'true');
    assert.equal(await page.locator('#regimen-dose').getAttribute('aria-invalid'), 'true');
    await capture(page, `${locale}-requirements`);
    await page.locator('#regimen-drug').fill('Estradiol');
    await page.locator('#regimen-dose').fill('2');
    await page.locator('#regimen-dose-unit').fill('mg');
    await page.locator('#regimen-route').fill('oral');
    await page.locator('[data-save-regimen]').click();
    await page.waitForSelector('[data-sheet]', { state: 'detached' });
    async function openDraft() {
      await page.locator('[data-episode]', { hasText: 'Estradiol' }).click();
      await page.locator('#regimen-dose').fill('3');
      await page.locator('#regimen-every').fill('5');
      await page.locator('[data-add-amount]').click();
      await page.locator('[data-amount-dose="0"]').fill('2');
      await page.locator('[data-amount-unit="0"]').fill('mg');
    }
    await openDraft();
    for (const zoom of [1, 2]) {
      await page.evaluate((zoom) => { document.documentElement.style.zoom = String(zoom); }, zoom);
      await groups(page, `${locale}-${zoom}x`);
    }
    await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
    await page.setViewportSize({ width: 1280, height: 900 });
    await groups(page, `${locale}-desktop`);
    await page.setViewportSize({ width: 390, height: 844 });
    if (locale === 'en') {
      for (const palette of PALETTES) {
        for (const theme of ['light', 'dark']) {
          await page.locator('[data-close-regimen]').click();
          await page.locator('[data-discard-record]').click();
          await page.waitForSelector('[data-sheet]', { state: 'detached' });
          await settlePage(page, base, '/settings', theme);
          await page.locator(`[data-palette-pick="${palette}"]`).click();
          await page.locator(`[data-segment="${theme}"]`).first().click();
          await settlePage(page, base, '/care/regimen', theme);
          await openDraft();
          await groups(page, `${palette}-${theme}`);
        }
      }
    }
    await page.locator('[data-save-regimen]').click();
    await page.waitForFunction(() => document.querySelector('[data-regimen-status]').textContent.length > 0);
    await page.locator('[data-regimen-status]').scrollIntoViewIfNeeded();
    await capture(page, `${locale}-episode-saved-schedule-pending`);
    await page.locator('[data-close-regimen]').click();
    await page.locator('[data-keep-editing]').waitFor();
    for (const zoom of [1, 2]) {
      await page.evaluate((zoom) => { document.documentElement.style.zoom = String(zoom); }, zoom);
      await capture(page, `${locale}-discard-${zoom}x`);
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(`PASS ${shots} regimen editor shots: ${PALETTES.length} palettes, both themes, English/Polish, 390px, 200% zoom, desktop and discard`);
} finally {
  await browser.close();
  await app.close();
}
