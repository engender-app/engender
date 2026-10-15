/* Run against a fresh isolated test APK. Physical devices require the phone lease.
   node tests/android-tier/focus-arrival.mjs SERIAL dev.engender.app.test.ui07 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { reachAccessSetup, ready, clientRoute, JOURNAL_SECRET } from '../browser-tier/built-flow.mjs';

const [serial, pkg] = process.argv.slice(2);
if (!serial || !/^dev\.engender\.app\.test\.[a-z0-9]+$/.test(pkg ?? '')) {
  throw new Error('Pass a device serial and an isolated dev.engender.app.test.<suffix> package');
}
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' }).trim();
const pid = adb('shell', 'pidof', pkg).split(/\s+/)[0];
const port = adb('forward', 'tcp:0', `localabstract:webview_devtools_remote_${pid}`);
let browser;
try {
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true });
  const page = browser.contexts()[0].pages()[0];
  page.setDefaultTimeout(30000);
  const origin = new URL(page.url()).origin;
  await reachAccessSetup(page, origin);
  await page.locator('[data-list-row="passphrase"]').press('Enter');
  await page.locator('[data-access-continue]').press('Enter');
  await page.locator('#am-passphrase').fill(JOURNAL_SECRET);
  await page.locator('#am-passphrase-confirm').fill(JOURNAL_SECRET);
  await page.locator('[data-access-submit]').press('Enter');
  await ready(page);
  for (let step = 0; step < 12 && await page.locator('[data-next]').count(); step++) {
    await page.locator('[data-next]').press('Enter');
  }
  await page.locator('[data-finish]').press('Enter');
  await page.locator('[data-home-hello]').waitFor();
  await page.reload();
  await page.locator('#journal-passphrase').fill(JOURNAL_SECRET);
  await page.locator('[data-passphrase-submit]').press('Enter');
  await ready(page);
  await page.waitForFunction(() => document.activeElement?.matches('[data-home-hero]'));
  console.log('PASS Android cold unlock focuses Today heading');

  // Retention starts on a route commit after idle preloading. Visit until
  // two doors are mounted, checking focus on every navigation along the way.
  for (let visit = 0; visit < 8; visit++) {
    await clientRoute(page, visit % 2 === 0 ? '/calendar' : '/');
    await page.evaluate(async () => {
      await Promise.all(document.getAnimations().filter(animation =>
        animation.effect?.getTiming().iterations !== Infinity
      ).map(animation => animation.finished.catch(() => {})));
      await new Promise(resolve => requestIdleCallback(resolve, { timeout: 1000 }));
    });
    await page.waitForFunction(() => document.activeElement?.matches('h1') && !document.activeElement.closest('[inert]'));
    if (await page.locator('[data-retained-door]').count() >= 2) break;
  }
  assert.ok(await page.locator('[data-retained-door]').count() >= 2, 'two doors are retained');
  await page.waitForFunction(() => document.activeElement?.matches('[data-retained-active] h1'));
  await clientRoute(page, '/');
  await page.waitForFunction(() => document.activeElement?.matches('[data-home-hero]'));
  assert.ok(await page.locator('[data-retained-door]:not([data-retained-active])').count());
  await page.locator('[data-retained-active] [data-edit-today]').press('Enter');
  await page.waitForFunction(() => document.activeElement?.matches('[data-retained-active] [data-today-editor] h2'));
  await page.locator('[data-retained-active] [data-edit-done]').press('Enter');
  await page.waitForFunction(() => document.activeElement?.matches('[data-retained-active] [data-edit-today]'));
  assert.equal(await page.evaluate(() => !!document.activeElement.closest('[inert]')), false);
  console.log('PASS Android retained-door navigation, Edit Today and Done focus only active door');
  console.log('Android API', adb('shell', 'getprop', 'ro.build.version.sdk'));
  console.log(adb('shell', 'dumpsys', 'webviewupdate').split('\n').find(line => line.includes('Current WebView package')));
} finally {
  if (browser) await browser.close();
  adb('forward', '--remove', `tcp:${port}`);
}
