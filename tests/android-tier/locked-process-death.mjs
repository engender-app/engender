import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { reportStage } from './instrumentation.mjs';

/** Runs on the tier's owned disposable emulator, never on a personal journal. */
export async function lockedProcessDeath({ device, pkg, evidenceDir, reporter }) {
  assert.match(pkg, /^dev\.engender\.app\.test\.[a-z0-9]+$/);
  let browser, forward;
  let testInstalled = true;
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const required = (args, options) => {
    const result = device(args, options);
    if (result.status !== 0 || result.error || result.signal) throw Error(`Android command failed: ${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
  };
  async function until(test, label, timeout = 30000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await test()) return;
      await pause(250);
    }
    throw Error(`Timed out: ${label}`);
  }
  async function disconnect() {
    await browser?.close(); browser = undefined;
    if (forward) required(['forward', '--remove', `tcp:${forward}`]);
    forward = undefined;
  }
  async function connect() {
    let page;
    await until(async () => {
      const process = device(['shell', 'pidof', pkg]);
      if (!process.stdout?.trim()) return false;
      forward ??= required(['forward', 'tcp:0', `localabstract:webview_devtools_remote_${process.stdout.trim().split(/\s+/)[0]}`]);
      try {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${forward}`, { timeout: 2000, noDefaults: true });
        page = browser.contexts()[0]?.pages()[0];
        if (page && await page.locator('[data-app-root]').count()) return true;
      } catch {}
      await browser?.close(); browser = undefined;
      required(['forward', '--remove', `tcp:${forward}`]); forward = undefined;
      return false;
    }, 'production WebView');
    page.setDefaultTimeout(30000);
    return page;
  }
  function stage(method) {
    const result = device(['shell', 'am', 'instrument', '-w', '-r', '-e', 'class',
      `dev.engender.app.reminders.LockedJournalProcessDeathTest#${method}`,
      `${pkg}.test/androidx.test.runner.AndroidJUnitRunner`], { timeout: 180000 });
    writeFileSync(join(evidenceDir, `lock-${method}.log`), result.stdout + result.stderr);
    assert.ok(reportStage(`locked journal ${method}`, result, reporter));
  }
  async function gate(page, arrival) {
    await page.locator('[data-key="1"]').waitFor().catch(() => { throw Error(`${arrival}: PIN pad missing`); });
    const state = await page.evaluate(() => ({
      pin: Boolean(document.querySelector('[data-key="1"]')),
      privateDom: document.body.outerHTML.includes('locked-journal-private-') ||
        [...document.querySelectorAll('input,textarea')].some(field => field.value.includes('locked-journal-private-'))
    }));
    assert.equal(state.pin, true, `${arrival}: PIN pad missing`);
    assert.equal(state.privateDom, false, `${arrival}: private text in DOM, including hidden doors`);
    return state;
  }
  async function unlockAndVisit(page) {
    await gate(page, 'before unlock');
    for (const digit of '1234') await page.locator(`[data-key="${digit}"]`).click();
    await page.locator('[data-nav-item="home"]:visible, [data-rail-item="home"]:visible').first().waitFor();
    for (const path of ['/', '/calendar', '/stats', '/more']) {
      await page.evaluate(path => {
        const link = document.createElement('a'); link.href = path; document.body.append(link); link.click(); link.remove();
      }, path);
      await page.waitForURL(url => url.pathname === path);
      await until(() => page.evaluate(() => document.body.textContent.includes('locked-journal-private-')), `private canary mounted at ${path}`);
    }
    assert.ok(await page.evaluate(() => document.body.textContent.includes('locked-journal-private-')),
      'private fixture must be mounted before concealment');
  }
  async function clickAndroidText(pattern) {
    const path = '/sdcard/lock-probe-49.xml';
    let bounds;
    try {
      await until(() => {
        required(['shell', 'uiautomator', 'dump', path]);
        const xml = required(['shell', 'cat', path]);
        for (const node of xml.matchAll(/<node\b[^>]*>/g)) {
          if (pattern.test(node[0])) {
            bounds = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node[0]);
            if (bounds && Number(bounds[3]) > Number(bounds[1])) return true;
          }
        }
        return false;
      }, 'Android arrival control');
      required(['shell', 'input', 'tap', String(Math.round((Number(bounds[1]) + Number(bounds[3])) / 2)),
        String(Math.round((Number(bounds[2]) + Number(bounds[4])) / 2))]);
    } finally { required(['shell', 'rm', '-f', path]); }
  }
  const launch = () => required(['shell', 'am', 'start', '-a', 'android.intent.action.MAIN', '-c',
    'android.intent.category.LAUNCHER', '-n', `${pkg}/dev.engender.app.Launch01`]);
  const rows = [];
  try {
    required(['shell', 'pm', 'clear', pkg]);
    stage('seed');
    required(['shell', 'pm', 'grant', pkg, 'android.permission.POST_NOTIFICATIONS']);
    stage('postReminder');
    // ActivityScenario leaves an EmptyActivity task. Remove the fixture APK
    // so recents can select only the production app's task.
    required(['uninstall', `${pkg}.test`]);
    testInstalled = false;
    launch();
    let page = await connect();
    for (const arrival of ['recents', 'launcher', 'reminder']) {
      await unlockAndVisit(page);
      const before = required(['shell', 'pidof', pkg]);
      required(['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
      await until(async () => (await page.locator('[data-key="1"]').count()) > 0, 'background lock');
      await disconnect();
      reporter.ok(`${arrival}: all four doors visited with private canary, background lock confirmed`);
      await until(() => {
        required(['shell', 'am', 'kill', pkg]);
        const absent = device(['shell', 'pidof', pkg]);
        return absent.status === 1 && !absent.error && !absent.signal && !absent.stdout?.trim();
      }, 'actual process death');
      reporter.ok(`${arrival}: am kill left the process absent`);
      if (arrival === 'launcher') launch();
      else if (arrival === 'recents') {
        required(['shell', 'input', 'keyevent', 'KEYCODE_APP_SWITCH']);
        await clickAndroidText(/(?:text|content-desc)="[^"\n]*[Ee]n[Gg]ender[^"\n]*"/);
      } else {
        required(['shell', 'cmd', 'statusbar', 'expand-notifications']);
        await clickAndroidText(/text="Lock probe arrival 49"/);
      }
      page = await connect();
      const after = required(['shell', 'pidof', pkg]);
      assert.notEqual(after, before, `${arrival}: must be a fresh process`);
      rows.push({ arrival, before, after, canaryBeforeKill: true, visitedDoors: ['/', '/calendar', '/stats', '/more'], ...(await gate(page, arrival)) });
      reporter.ok(`${arrival}: fresh process requires PIN and conceals all private DOM`);
    }
    writeFileSync(join(evidenceDir, 'locked-process-death.json'), JSON.stringify(rows, null, 2));
  } finally {
    await disconnect();
    required(['shell', 'am', 'force-stop', pkg]);
    if (testInstalled) required(['uninstall', `${pkg}.test`]);
    required(['uninstall', pkg]);
  }
}
