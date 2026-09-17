import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { preview } from 'vite';
import { launchChromium } from './browser-harness.mjs';
import { checkRadioGroup } from './browser-tier/radio-controls.mjs';
import { PALETTES } from './palettes.mjs';

const out = resolve(process.env.RADIO_SHOTS ?? '.claude/radio-groups-shots');
await mkdir(out, { recursive: true });
const app = await preview({ preview: { port: 0 } });
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const base = `http://localhost:${app.httpServer.address().port}`;
const errors = [];
page.on('pageerror', error => errors.push(String(error)));

async function open(path) {
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(base + path, { waitUntil: 'networkidle' });
  }
  await page.evaluate(() => {
    document.querySelector('.demo-bar')?.remove();
    document.body.classList.remove('has-demo-bar');
  });
}

async function geometry() {
  const result = await page.locator('[data-save-moods] [role="radio"]').evaluateAll(radios => radios.map(radio => {
    const box = radio.getBoundingClientRect();
    const points = [[1, box.height / 2], [box.width - 1, box.height / 2],
      [box.width / 2, 1], [box.width / 2, box.height - 1], [box.width / 2, box.height / 2]];
    return { width: box.width, height: box.height,
      ownsPoints: points.every(([x, y]) => radio.contains(document.elementFromPoint(box.x + x, box.y + y))) };
  }));
  assert.equal(result.length, 5);
  assert.ok(result.every(box => box.width >= 48 && box.height >= 48 && box.ownsPoints), JSON.stringify(result));
  assert.equal(await page.locator('[data-save]').evaluate(button => {
    const box = button.getBoundingClientRect();
    return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  }), true, 'Save remains reachable');
}

async function shot(name, crop = false) {
  await page.evaluate(() => document.querySelectorAll('[data-toast]').forEach(el => el.remove()));
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200);
  await (crop ? page.locator('[data-app-savebar]') : page).screenshot({ path: `${out}/${name}.png` });
}

try {
  await open('/entry/new/today');
  assert.equal(await page.locator('[data-save-unmet="mood"]').count(), 1);
  await page.locator('[data-save]').click();
  assert.ok(page.url().includes('/entry/new/'), 'missing mood does not save');
  await page.keyboard.press('Space');
  await checkRadioGroup(page, page.locator('.mood-picker'));
  await page.locator('#ed-note').fill('U03 keyboard entry');
  await page.locator('[data-save]').click();
  await page.waitForSelector('[data-home-log]');
  await open('/day/today');
  await page.locator('[data-entry-note]').filter({ hasText: 'U03 keyboard entry' }).click();
  await page.waitForSelector('#ed-note');
  await checkRadioGroup(page, page.locator('.mood-picker'));
  await page.locator('#ed-note').fill('U03 keyboard entry edited');
  await shot('existing-entry-390');
  await page.locator('[data-save]').click();
  await page.waitForSelector('[data-home-log]');
  await open('/day/today');
  assert.equal(await page.locator('[data-entry-note]').filter({ hasText: 'U03 keyboard entry edited' }).count(), 1);

  for (const language of ['en', 'pl']) {
    await open('/settings');
    await page.locator(`[data-segment="${language}"]`).click();
    await page.waitForSelector(`[data-segment="${language}"][aria-checked="true"]`);
    for (const group of await page.locator('.palette-grid, .mood-preset-grid').all()) await checkRadioGroup(page, group);
    await page.locator('[data-palette-pick="trans"]').click();
    await page.locator('[data-mood-preset-pick="teal"]').click();
    await page.locator('[data-segment="light"]').click();
    await shot(`settings-${language}-390`);
    for (const width of [320, 390, 430, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await open('/entry/new/today');
      await shot(`new-entry-${language}-${width}`);
      await geometry();
    }
  }
  await page.setViewportSize({ width: 390, height: 360 });
  await page.locator('#ed-note').focus();
  await shot('short-viewport-pl-390');
  await geometry();
  await page.setViewportSize({ width: 390, height: 844 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  assert.equal(await page.evaluate(() => visualViewport.scale), 2);
  await page.locator('[data-save]').scrollIntoViewIfNeeded();
  await shot('pinch-zoom-200');
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });

  for (const palette of PALETTES) for (const theme of ['light', 'dark']) {
    await page.evaluate(({ palette, theme }) => {
      document.documentElement.dataset.palette = palette;
      document.documentElement.dataset.theme = theme;
    }, { palette, theme });
    await geometry();
    await shot(`savebar-${palette}-${theme}`, true);
  }
  assert.deepEqual(errors, []);
  console.log(`PASS new and existing entry flows; radio keyboard; target hit tests; screenshots: ${out}`);
} finally {
  await browser.close();
  await new Promise(resolve => app.httpServer.close(resolve));
}
