/* Wear reminder hours on Android (last-audit UI 01). The field renders only
   on Android, so tests/wear-entry-check.mjs cannot reach it.

   Run against a disposable emulator with a demo debug APK installed under a
   separate applicationId, never the real app:
     node tests/android-tier/wear-reminder-hours.mjs emulator-5574 [dev.engender.app.test]

   Types the hours one key at a time through Android's own input (`adb shell
   input text`, one character per call), the way a keyboard sends them. On
   the old string binding (API 35 emulator, 2026-10-15) 1, ., 5 read 1, 1,
   51. Then checks the saved reminder against the session's own start, and
   that Stop with the hours cleared and the reminder still switched on keeps
   the reminder that was set. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const serial = process.argv[2];
const pkg = process.argv[3] ?? 'dev.engender.app.test';
if (!/^emulator-\d+$/.test(serial ?? '')) throw new Error('Pass an emulator serial');
// `pm clear` below wipes the package's data, so only a test install is accepted.
if (!/^dev\.engender\.app\.test(\.[\w.]+)?$/.test(pkg)) throw new Error('Pass a dev.engender.app.test install; this probe never drives the real app');
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
adb('shell', 'am', 'force-stop', pkg);
// A fresh journal each run: the separate test install's data only.
adb('shell', 'pm', 'clear', pkg);
const activity = adb('shell', 'cmd', 'package', 'resolve-activity', '--brief', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', '-p', pkg).trim().split('\n').at(-1);
adb('shell', 'am', 'start', '-W', '-n', activity);
let pid = '';
for (let i = 0; i < 50 && !pid; i++) {
  try { pid = adb('shell', 'pidof', pkg).trim().split(/\s+/)[0]; } catch { await new Promise((resolve) => setTimeout(resolve, 200)); }
}
let port;
let browser;
let page;
const errors = [];
/** The reminders list's origin line for a wear reminder, in either locale
    the app may have picked up from the device. */
const wearOrigin = ['en', 'pl'].map((locale) => JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), 'utf8')).prov_reminder_wear);

const hours = () => page.locator('#wear-reminder-hours');
const reminderSwitch = () => page.locator('[data-sheet]').getByRole('switch');

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

/** Each character through Android's input pipeline, reading the field after
    each so a rewrite shows at the key that caused it. The old binding
    rewrote the field one tick after the input event; 300ms is well past
    that, and nothing else changes the field meanwhile. */
async function typeOnDevice(text) {
  const seen = [];
  for (const char of text) {
    adb('shell', 'input', 'text', char);
    await new Promise((resolve) => setTimeout(resolve, 300));
    seen.push(await hours().inputValue());
  }
  return seen;
}

/** HH:MM of `ms` in the device's own time zone, which is the one the
    reminder is written in. */
const hhmm = (ms) => page.evaluate((ms) => {
  const at = new Date(ms);
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}, ms);

/** The wear reminders as the reminders list shows them: id and time. The
    APK serves a built bundle, so the journal is read through the screen. */
async function wearReminders() {
  await navigate('/settings/reminders');
  const rows = page.locator('[data-list-row]').filter({ hasText: new RegExp(wearOrigin.map((line) => line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')) });
  await rows.first().waitFor({ timeout: 10000 }).catch(() => {});
  const found = await rows.evaluateAll((els) => els.map((el) => ({ id: el.dataset.listRow, time: el.innerText.match(/\b\d{2}:\d{2}\b/g)?.at(-1) })));
  await navigate('/body/wear');
  return found;
}

try {
  port = adb('forward', 'tcp:0', `localabstract:webview_devtools_remote_${pid}`).trim();
  for (let i = 0; i < 50 && !browser; i++) {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true }).catch(() => undefined);
    if (!browser) await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(browser, 'the test app exposes its WebView over CDP');
  page = browser.contexts()[0].pages()[0];
  page.setDefaultTimeout(30000);
  page.on('pageerror', (error) => errors.push(error.message));
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
  await navigate('/body/wear');
  await page.locator('[data-add]').waitFor();
  assert.equal(await page.locator('[data-wear-running]').count(), 0, 'starts with no running session');

  await page.locator('[data-add]').click();
  await reminderSwitch().click();
  await hours().waitFor();
  await hours().click();
  const seen = await typeOnDevice('1.5');
  console.log(`typed 1, ., 5 on ${serial}; field read ${JSON.stringify(seen)}`);
  assert.equal(seen.at(-1), '1.5', 'typing 1.5 key by key keeps it');
  const before = await page.evaluate(() => Date.now());
  await page.locator('[data-start-wear-session]').click();
  await page.locator('[data-wear-running]').waitFor();
  const afterStart = await page.evaluate(() => Date.now());
  const set = await wearReminders();
  const expected = [...new Set([await hhmm(before + 90 * 60000), await hhmm(afterStart + 90 * 60000)])];
  console.log(`reminder ${JSON.stringify(set)}; expected one of ${JSON.stringify(expected)}`);
  assert.equal(set.length, 1, 'one reminder for the session');
  assert.ok(expected.includes(set[0].time), 'the reminder is 1.5 hours after the start');
  await page.locator('[data-wear-running]').waitFor();
  // The list shows the time; reopening reads day and time back into hours
  // (hoursAfterStart), so a reminder on the wrong day would not read 1.5.
  await page.locator('[data-wear-running]').click();
  await hours().waitFor();
  assert.equal(await hours().inputValue(), '1.5', 'the running session reopens with 1.5 hours');
  console.log('PASS reminder hours typed key by key through Android input keep 1.5, and the reminder is set 1.5 hours after the start');

  /* Stop clears an automatic reminder that would fire after the session
     ended (wearSessions.upsertSession): a check-in for a binder already off
     no longer applies. That rule is the journal's, not this ticket's. */
  await page.locator('[data-stop-wear-session]').click();
  await page.locator('[data-wear-running]').waitFor({ state: 'detached' });
  assert.deepEqual(await wearReminders(), [], 'Stop clears a reminder still ahead of it');

  /* Stop is the one save canSave does not gate. With the reminder still on
     and its hours cleared, it must leave the reminder already set. The
     reminder here has to be due before the stop, or the rule above removes
     it whatever the field holds: 0.01 hours is 36 seconds after the start. */
  await page.locator('[data-add]').click();
  await reminderSwitch().click();
  await hours().waitFor();
  await hours().click();
  const small = await typeOnDevice('0.01');
  console.log(`typed 0, ., 0, 1; field read ${JSON.stringify(small)}`);
  assert.equal(small.at(-1), '0.01', 'typing 0.01 key by key keeps it');
  await page.locator('[data-start-wear-session]').click();
  await page.locator('[data-wear-running]').waitFor();
  // The session's start is before this moment, so 40s from here is past
  // its 36-second reminder however long the save took.
  const started = await page.evaluate(() => Date.now());
  await page.waitForFunction((started) => Date.now() > started + 40000, started, { timeout: 60000, polling: 1000 });
  const due = await wearReminders();
  assert.equal(due.length, 1, 'one reminder for the second session');
  await page.locator('[data-wear-running]').click();
  await hours().waitFor();
  assert.equal(await reminderSwitch().getAttribute('aria-checked'), 'true');
  await hours().fill('');
  assert.equal(await hours().inputValue(), '');
  await page.locator('[data-stop-wear-session]').click();
  await page.locator('[data-wear-running]').waitFor({ state: 'detached' });
  const after = await wearReminders();
  console.log(`reminder before Stop ${JSON.stringify(due)}; after Stop with blank hours ${JSON.stringify(after)}`);
  assert.deepEqual(after, due, 'Stop with the hours cleared keeps the reminder');
  console.log('PASS Stop with the reminder on and its hours cleared keeps the reminder already set');
  assert.deepEqual(errors, []);
} catch (error) {
  console.error(errors);
  throw error;
} finally {
  await browser?.close();
  if (port) adb('forward', '--remove', `tcp:${port}`);
}
