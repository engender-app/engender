/* Run against a disposable emulator with the demo debug APK installed:
   node tests/android-tier/back-navigation.mjs emulator-5556 [--gesture]
   Complete setup first. Gesture mode requires Android gesture navigation.
   Uses real Android Back events; no JavaScript back-button substitute. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const serial = process.argv[2];
if (!/^emulator-\d+$/.test(serial ?? '')) throw new Error('Pass an emulator serial');
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
const pkg = 'dev.engender.app';
const gesture = process.argv.includes('--gesture');
const [, width, height] = /Physical size: (\d+)x(\d+)/.exec(adb('shell', 'wm', 'size'));
const gestureY = String(Math.round(Number(height) / 2));
const gestureEndX = String(Math.round(Number(width) / 3));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
adb('shell', 'am', 'start', '-n', `${pkg}/.disguise.LauncherDefault`);
await pause(2000);
const pid = adb('shell', 'pidof', pkg).trim().split(/\s+/)[0];
const port = adb('forward', 'tcp:0', `localabstract:webview_devtools_remote_${pid}`).trim();
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true });
const page = browser.contexts()[0].pages()[0];
page.setDefaultTimeout(20000);
const route = '/health/appointments';
async function navigate(path) {
  await page.evaluate((path) => {
    const a = document.createElement('a');
    a.href = path;
    document.body.append(a);
    a.click();
    a.remove();
  }, path);
  await page.waitForURL((url) => url.pathname === path);
}
async function back() {
  if (gesture) adb('shell', 'input', 'swipe', '1', gestureY, gestureEndX, gestureY, '300');
  else adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await pause(600);
}
function imeOpen() {
  return /mInputShown=true|isInputViewShown=true/.test(adb('shell', 'dumpsys', 'input_method'));
}
async function openSheet() {
  await page.locator('[data-add]').click();
  await page.waitForFunction(() => document.activeElement?.closest('[data-sheet]'));
  await page.locator('.flatpickr-calendar.open').waitFor();
}
async function sameRoute() {
  assert.equal(new URL(page.url()).pathname, route);
}
try {
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  await navigate('/');
  await navigate(route);
  await openSheet();
  assert.equal(imeOpen(), false);
  await back();
  assert.equal(await page.locator('.flatpickr-calendar.open').count(), 0);
  assert.equal(await page.locator('[data-sheet]').count(), 1);
  await sameRoute();
  await back();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  await sameRoute();
  console.log('PASS native Back closes calendar then clean sheet without navigation');

  await openSheet();
  await page.locator('[data-sheet] h3').click();
  assert.equal(await page.locator('.flatpickr-calendar.open').count(), 0);
  assert.equal(await page.locator('[data-sheet]').count(), 1);
  console.log('PASS completed outside click closes calendar without closing sheet');
  const notes = page.locator('#appointment-note');
  await notes.fill('Keep these unfinished appointment notes');
  await notes.click();
  await pause(500);
  assert.equal(imeOpen(), true, 'IME must be open before testing platform consumption');
  await back();
  assert.equal(imeOpen(), false);
  assert.equal(await page.locator('[data-keep-editing]').count(), 0);
  assert.equal(await notes.inputValue(), 'Keep these unfinished appointment notes');
  await sameRoute();
  console.log('PASS IME consumes first Back without dismissing edited sheet');

  await back();
  await page.locator('[data-keep-editing]').waitFor();
  await back();
  await page.locator('[data-keep-editing]').waitFor({ state: 'detached' });
  assert.equal(await notes.inputValue(), 'Keep these unfinished appointment notes');
  if (imeOpen()) await back();
  await back();
  await page.locator('[data-keep-editing]').click();
  await page.locator('[data-keep-editing]').waitFor({ state: 'detached' });
  assert.equal(await notes.inputValue(), 'Keep these unfinished appointment notes');
  if (imeOpen()) await back();
  await back();
  const count = await page.locator('[data-appointment]').count();
  await page.locator('[data-discard-record]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  assert.equal(await page.locator('[data-appointment]').count(), count);
  await sameRoute();
  console.log('PASS Back cancels discard decision; Keep editing preserves notes; Discard writes nothing');

  await page.locator('[data-add]').click();
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  await sameRoute();
  assert.equal(await page.locator('.flatpickr-calendar.open').count(), 0);
  console.log('PASS native Back during opening leaves no stale calendar or sheet');

  await openSheet();
  await back();
  adb('shell', 'input keyevent KEYCODE_BACK; input keyevent KEYCODE_BACK');
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  await sameRoute();
  console.log('PASS repeated native Back during sheet exit does not navigate');

  await back();
  await page.waitForURL((url) => url.pathname === '/');
  console.log('PASS native Back navigates when no surface remains');
  await back();
  const activity = adb('shell', 'dumpsys', 'activity', 'activities');
  const resumed = activity.split('\n').filter((line) => /mResumedActivity|topResumedActivity/.test(line)).join('\n');
  assert.ok(!resumed.includes(pkg), resumed);
  console.log('PASS native Back minimizes at root');
  console.log(gesture ? 'Gesture mode' : 'Hardware-key mode');
  console.log(adb('shell', 'getprop', 'ro.build.version.sdk').trim(), adb('shell', 'dumpsys', 'webviewupdate').split('\n').find((line) => line.includes('Current WebView package')));
} finally {
  await browser.close();
  adb('forward', '--remove', `tcp:${port}`);
}
