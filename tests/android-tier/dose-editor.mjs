/* Run against a disposable emulator with the demo debug APK installed:
   node tests/android-tier/dose-editor.mjs emulator-5554
   Back and drag use Android input, rather than JavaScript dismissal. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const serial = process.argv[2];
if (!/^emulator-\d+$/.test(serial ?? '')) throw new Error('Pass an emulator serial');
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
const pkg = 'dev.engender.app';
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
  }
  if (await page.locator('[data-access-modes]').count()) {
    await page.locator('[data-list-row="unlocked"]').click();
    await page.locator('[data-access-submit]').click();
    await page.locator('[data-leave-setup]').click();
  }
  await page.locator('[data-home-hello]').waitFor();
  await navigate('/care/doses');
  await page.locator('[data-attribution-toggle]').waitFor();
  const count = await page.locator('[data-dose]').count();
  await page.locator('[data-add]').click();
  const what = page.locator('[data-dose-what]');
  if (await what.getAttribute('aria-expanded') === 'false') await what.click();
  const amount = page.locator('#dose-amount');
  const baseline = await amount.inputValue();
  await amount.fill('7.5');
  await page.locator('[data-dose-what]').click();
  await closeKeyboard();
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await page.locator('[data-keep-editing]').waitFor();
  await page.locator('[data-keep-editing]').click();
  await page.locator('[data-keep-editing]').waitFor({ state: 'detached' });
  await what.click();
  assert.equal(await amount.inputValue(), '7.5');
  assert.equal(new URL(page.url()).pathname, '/care/doses');
  console.log('PASS native Back protects changed dose; Keep editing retains amount');

  await what.click();
  await page.locator('[data-sheet]').evaluate((el) => { el.scrollTop = 0; });
  const swipe = await page.evaluate(() => {
    const rect = document.querySelector('.sheet-handle').getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: innerWidth };
  });
  const physicalWidth = Number(/Physical size: (\d+)x\d+/.exec(adb('shell', 'wm', 'size'))[1]);
  const scale = physicalWidth / swipe.width;
  const x = String(Math.round(swipe.x * scale));
  const y = String(Math.round(swipe.y * scale));
  adb('shell', 'input', 'swipe', x, y, x, String(Math.round((swipe.y + 150) * scale)), '350');
  await page.locator('[data-keep-editing]').waitFor();
  await page.locator('[data-keep-editing]').click();
  await page.locator('[data-keep-editing]').waitFor({ state: 'detached' });
  assert.equal(await page.locator('[data-sheet-drag]').evaluate((el) => el.style.transform), '');
  await what.click();
  assert.equal(await amount.inputValue(), '7.5');
  console.log('PASS native downward drag protects dose and restores sheet position');

  await amount.fill(baseline);
  await what.click();
  await closeKeyboard();
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  assert.equal(await page.locator('[data-keep-editing]').count(), 0);
  assert.equal(await page.locator('[data-dose]').count(), count);
  assert.equal(new URL(page.url()).pathname, '/care/doses');
  console.log('PASS reverted dose closes with native Back without writing or navigating');
} catch (error) {
  console.error(errors, await page.locator('body').innerText());
  throw error;
} finally {
  await browser.close();
  adb('forward', '--remove', `tcp:${port}`);
}
