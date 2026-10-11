/* Settings return checks against a demo build. Pass an emulator serial to
   run against its installed debug APK with native Back events instead. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { launchChromium } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const serial = process.argv.find((arg) => /^emulator-\d+$/.test(arg));
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
const app = serial ? null : await preview({ preview: { port: 0 } });
const base = serial ? 'https://localhost' : `http://localhost:${app.httpServer.address().port}`;
let port;
if (serial) {
  const pid = adb('shell', 'pidof', 'dev.engender.app').trim().split(/\s+/)[0];
  port = adb('forward', 'tcp:0', `localabstract:webview_devtools_remote_${pid}`).trim();
}
const browser = serial
  ? await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true })
  : await launchChromium();
const page = serial ? browser.contexts()[0].pages()[0] : await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
const position = () => page.locator('[data-app-scroll-region]').evaluate((el) => el.scrollTop);
const back = async () => {
  if (serial) adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  else await page.goBack();
};
const navigate = async (path, destination = path) => {
  await page.evaluate((path) => {
    const link = document.createElement('a');
    link.href = path;
    document.body.append(link);
    link.click();
    link.remove();
  }, path);
  await page.waitForURL((url) => url.pathname === destination);
  await page.waitForTimeout(700);
};
const checkPosition = async (before, label) => {
  const after = await position();
  assert.ok(Math.abs(after - before) <= 1, `${label}: Settings moved from ${before}px to ${after}px`);
  console.log(`PASS ${label}: ${before}px -> ${after}px`);
};

try {
  if (!serial) await page.goto(`${base}/settings`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }
  await navigate('/settings');
  await checkPosition(0, 'direct entry starts at top');

  for (const path of ['/settings/notifications', '/settings/words']) {
    for (const method of ['header', serial ? 'system Back' : 'browser Back']) {
      const row = page.locator(`a[href="${path}"]`);
      await row.scrollIntoViewIfNeeded();
      await page.waitForTimeout(100);
      const before = await position();
      assert.ok(before > 1000, 'Settings must be scrolled deeply');
      await row.click();
      await page.waitForURL((url) => url.pathname === path);
      await page.waitForTimeout(700);
      if (method === 'header') await page.locator('[data-screen-back]').click();
      else await back();
      await page.waitForURL('**/settings');
      await page.waitForTimeout(900);
      await checkPosition(before, `${path}, ${method}`);
    }
  }

  for (const key of ['presentations', 'entry-templates']) {
    const row = page.locator(`[data-list-row="${key}"]`);
    await row.scrollIntoViewIfNeeded();
    const before = await position();
    assert.ok(before > 1000, 'Manager row must be below fold');
    const historyLength = await page.evaluate(() => history.length);
    await row.click();
    await page.locator('[role="dialog"]').waitFor();
    if (serial) adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
    else await page.keyboard.press('Escape');
    await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
    await checkPosition(before, `${key}, ${serial ? 'system Back' : 'Escape'}`);
    assert.equal(new URL(page.url()).pathname, '/settings');
    assert.equal(await page.evaluate(() => history.length), historyLength, 'Opening a manager must not add history');
  }

  // Leave immediately after opening a detail screen, before its motion settles.
  await page.locator('[data-list-row="words"]').click();
  await page.waitForURL('**/settings/words');
  await navigate('/');
  await navigate('/settings');
  await checkPosition(0, 'new visit after interrupted detail starts at top');

  for (const path of ['/settings/presentations', '/settings/entry-templates']) {
    await navigate(path, '/settings');
    await page.locator('[role="dialog"]').waitFor();
    if (serial) adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
    else await page.keyboard.press('Escape');
    await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
    await checkPosition(0, `${path}, legacy deep link starts at top`);
  }

  if (process.argv.includes('--gallery')) {
    const out = '.claude/settings-scroll-shots';
    await mkdir(out, { recursive: true });
    for (const palette of PALETTES) for (const theme of ['light', 'dark']) {
      await page.locator(`[data-palette-pick="${palette}"]`).click();
      await page.locator(`[data-segment="${theme}"]`).click();
      const rows = page.locator('[data-list-row="presentations"]').locator('..');
      await rows.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await rows.screenshot({ path: `${out}/${palette}-${theme}.png` });
    }
  }
  assert.deepEqual(errors, [], 'No uncaught page errors');
} finally {
  await browser.close();
  if (port) adb('forward', '--remove', `tcp:${port}`);
  if (app) await new Promise((resolve) => app.httpServer.close(resolve));
}
