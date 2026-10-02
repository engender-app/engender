/* Run against a disposable emulator with the demo debug APK installed:
   node tests/android-tier/regimen-editor.mjs emulator-5554
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
  await navigate('/care/regimen');
  await page.locator('[data-add]').click();
  await page.locator('[data-own]').click();
  await page.locator('#regimen-drug').fill('Android regimen proof');
  await page.locator('#regimen-dose').fill('2');
  await page.locator('#regimen-dose-unit').fill('mg');
  await page.locator('#regimen-route').fill('oral');
  await page.locator('[data-save-regimen]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  await page.locator('[data-episode]', { hasText: 'Android regimen proof' }).last().click();
  await page.locator('#regimen-every').fill('5');
  await page.locator('#regimen-dose').fill('3');
  await page.locator('[data-save-regimen]').click();
  await page.waitForFunction(() => document.querySelector('[data-regimen-status]').textContent.includes('unsaved'));
  await page.locator('[data-sheet]').evaluate((el) => { el.scrollTop = 0; });
  await page.locator('.sheet-handle').click();
  await closeKeyboard();
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await page.locator('[data-keep-editing]').click();
  await page.locator('[data-keep-editing]').waitFor({ state: 'detached' });
  assert.equal(await page.locator('#regimen-every').inputValue(), '5');
  assert.equal(await page.locator('#regimen-dose').inputValue(), '3');
  assert.equal(new URL(page.url()).pathname, '/care/regimen');
  console.log('PASS native Back protects schedule after episode save; Keep editing retains both values');
  await page.locator('[data-save-schedule]').click();
  await page.waitForFunction(() => document.querySelector('[data-regimen-status]').textContent.includes('Schedule saved'));
  await page.locator('#regimen-dose').fill('4');
  await page.locator('[data-sheet]').evaluate((el) => { el.scrollTop = 0; });
  await page.locator('.sheet-handle').click();
  await closeKeyboard();
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await page.locator('[data-discard-record]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  await page.locator('[data-episode]', { hasText: 'Android regimen proof' }).last().click();
  assert.equal(await page.locator('#regimen-every').inputValue(), '5');
  assert.equal(await page.locator('#regimen-dose').inputValue(), '3');
  await page.locator('.sheet-handle').click();
  await closeKeyboard();
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  assert.equal(new URL(page.url()).pathname, '/care/regimen');
  assert.equal(await page.locator('[data-keep-editing]').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS native Back discards only episode draft, retains saved schedule; clean Back closes directly');
} catch (error) {
  console.error(errors, await page.locator('body').innerText());
  throw error;
} finally {
  await browser.close();
  adb('forward', '--remove', `tcp:${port}`);
}
