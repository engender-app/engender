/* Run against a disposable emulator with the demo debug APK installed:
   node tests/android-tier/letter-composition.mjs emulator-5554
   Back and drag use Android input, rather than JavaScript dismissal. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const serial = process.argv[2];
if (!/^emulator-\d+$/.test(serial ?? '')) throw new Error('Pass an emulator serial');
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
const pkg = 'dev.engender.app';
adb('shell', 'am', 'force-stop', pkg);
const activity = adb('shell', 'cmd', 'package', 'resolve-activity', '--brief', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', '-p', pkg).trim().split('\n').at(-1);
adb('shell', 'am', 'start', '-W', '-n', activity);
await new Promise((resolve) => setTimeout(resolve, 1000));
const pid = adb('shell', 'pidof', pkg).trim().split(/\s+/)[0];
const port = adb('forward', 'tcp:0', `localabstract:webview_devtools_remote_${pid}`).trim();
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true });
const page = browser.contexts()[0].pages()[0];
page.setDefaultTimeout(30000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const imeOpen = () => /mInputShown=true|isInputViewShown=true/.test(adb('shell', 'dumpsys', 'input_method'));
async function navigate(path) {
  await page.evaluate((path) => {
    const link = document.createElement('a');
    link.href = path;
    document.body.append(link);
    link.click();
    link.remove();
  }, path);
  await page.waitForURL((url) => url.pathname === path);
}
async function closeKeyboard() {
  if (imeOpen()) adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await page.waitForFunction(() => !document.activeElement?.matches('input:not([readonly]), textarea'));
}
try {
  await page.waitForSelector('[data-leave-setup], [data-access-modes], [data-app-root][data-boot="ready"]', { timeout: 60000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-access-modes], [data-home-hello]');
  }
  if (await page.locator('[data-access-modes]').count()) {
    await page.locator('[data-list-row="unlocked"]').click();
    await page.locator('[data-access-submit]').click();
    await page.locator('[data-leave-setup]').click();
  }
  await page.locator('[data-home-hello]').waitFor();
  await page.evaluate(() => {
    for (const bar of document.querySelectorAll('.demo-bar')) bar.style.display = 'none';
    document.body.classList.remove('has-demo-bar');
  });
  await navigate('/transition/letters');
  await page.locator('[data-add]').click();
  const text = page.locator('#letter-text');
  const date = await page.locator('#letter-unlock').inputValue();
  await text.fill('Native letter proof');
  await text.evaluate((el) => el.blur());
  await closeKeyboard();
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await page.locator('[data-keep-editing]').click();
  await page.locator('[data-keep-editing]').waitFor({ state: 'detached' });
  assert.equal(await text.inputValue(), 'Native letter proof');
  assert.equal(await page.locator('#letter-unlock').inputValue(), date);
  console.log('PASS native Back protects composition; Keep editing retains text/date');

  await page.locator('[data-sheet]').evaluate((el) => { el.scrollTop = 0; });
  const swipe = await page.evaluate(() => {
    const rect = document.querySelector('.sheet-handle').getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: innerWidth };
  });
  adb('shell', 'uiautomator', 'dump', '/sdcard/letter-composition-window.xml');
  const hierarchy = adb('shell', 'cat', '/sdcard/letter-composition-window.xml');
  const bounds = /class="android.webkit.WebView"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(hierarchy);
  assert.ok(bounds, 'Native WebView bounds are available');
  const [left, top, right] = bounds.slice(1).map(Number);
  const scale = (right - left) / swipe.width;
  const x = String(Math.round(left + swipe.x * scale));
  const y = String(Math.round(top + swipe.y * scale));
  adb('shell', 'input', 'swipe', x, y, x, String(Math.round(top + (swipe.y + 150) * scale)), '350');
  await page.locator('[data-keep-editing]').waitFor();
  await page.locator('[data-keep-editing]').click();
  await page.locator('[data-keep-editing]').waitFor({ state: 'detached' });
  assert.equal(await page.locator('[data-sheet-drag]').evaluate((el) => el.style.transform), '');
  assert.equal(await text.inputValue(), 'Native letter proof');
  console.log('PASS native drag protects composition and restores sheet position');
  await text.fill('');
  await text.evaluate((el) => el.blur());
  await closeKeyboard();
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  assert.equal(await page.locator('[data-keep-editing]').count(), 0);
  assert.equal(new URL(page.url()).pathname, '/transition/letters');
  console.log('PASS reverted composition closes on native Back without navigation');
} catch (error) {
  console.error(errors, await page.locator('body').innerText());
  throw error;
} finally {
  await browser.close();
  adb('forward', '--remove', `tcp:${port}`);
}
