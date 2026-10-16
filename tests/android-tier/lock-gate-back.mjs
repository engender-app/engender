/* Uses real Android Back against an isolated, already seeded production APK.
   PIN fixture: LockedJournalProcessDeathTest#seed (1234, immediate lock).
   Device-key fixture: complete production first-run setup with device-bound access. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const [serial, pkg, mode, output] = process.argv.slice(2);
assert.ok(serial && pkg && output, 'Pass serial, isolated package, pin|key, output JSON');
assert.match(pkg, /^dev\.engender\.app\.test\.[a-z0-9]+$/);
assert.ok(mode === 'pin' || mode === 'key');
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', timeout: 30000 });
const launch = () => adb('shell', 'am', 'start', '-n', `${pkg}/dev.engender.app.disguise.LauncherDefault`);
const back = () => adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
const resumedActivities = () => adb('shell', 'dumpsys', 'activity', 'activities').split('\n')
  .filter(line => /^\s*(?:mResumedActivity|topResumedActivity|ResumedActivity)\s*[:=]/.test(line));
const foreground = () => resumedActivities().some(line => line.includes(pkg + '/'));
async function until(check, label) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error(`Timed out: ${label}`);
}
let connection, forward;
const evidence = { serial, package: pkg, mode, probeSourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), checks: [] };
try {
  adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
  adb('shell', 'am', 'force-stop', pkg);
  launch();
  let pid;
  await until(() => {
    try { pid = adb('shell', 'pidof', pkg).trim().split(/\s+/)[0]; return Boolean(pid); }
    catch { return false; }
  }, 'app process');
  forward = adb('forward', 'tcp:0', `localabstract:webview_devtools_remote_${pid}`).trim();
  let page;
  await until(async () => {
    try {
      connection ??= await chromium.connectOverCDP(`http://127.0.0.1:${forward}`, { timeout: 1000, noDefaults: true });
      page = connection.contexts()[0]?.pages()[0];
      return Boolean(page);
    } catch {
      return false;
    }
  }, 'WebView debugging endpoint');
  page.setDefaultTimeout(30000);
  const route = () => new URL(page.url()).pathname;
  const gate = page.locator(mode === 'pin' ? '[data-key="1"]' : '[data-key-status]');
  await gate.waitFor();
  evidence.webRelease = await page.evaluate(async () => (await fetch('/release.json')).json());
  if (mode === 'key') {
    // The initial native biometric prompt is separate from app Back.
    const nativePrompt = () => adb('shell', 'dumpsys', 'window', 'windows').split('\n')
      .some(line => line.includes('mCurrentFocus') && line.includes('com.android.systemui'));
    await until(async () => nativePrompt() || await page.locator('[data-key-retry]:enabled, [data-key-device-credential]:enabled').count(), 'authentication outcome');
    if (nativePrompt()) back();
    await until(() => foreground(), 'return from authentication');
    await page.locator('[data-key-retry]:enabled, [data-key-device-credential]:enabled').waitFor();
  }
  assert.equal(await page.locator('[data-nav-item="home"]:visible, [data-rail-item="home"]:visible').count(), 0);
  const coldRoute = route();
  evidence.coldBack = { before: resumedActivities() };
  back();
  try {
    await until(() => !foreground(), 'cold gate backgrounds app');
  } finally {
    evidence.coldBack.after = resumedActivities();
  }
  assert.equal(route(), coldRoute);
  evidence.checks.push({ name: 'cold gate Back backgrounds without navigation', route: coldRoute, passed: true });
  launch();
  await until(() => foreground(), 'return to cold gate');
  await gate.waitFor();
  assert.equal(route(), coldRoute);
  if (mode === 'pin') {
    async function unlock() {
      for (const digit of '1234') await page.locator(`[data-key="${digit}"]`).click();
      await page.locator('[data-nav-item="home"]:visible, [data-rail-item="home"]:visible').first().waitFor();
    }
    async function navigate(path) {
      await page.evaluate(path => {
        const a = document.createElement('a'); a.href = path; document.body.append(a); a.click(); a.remove();
      }, path);
      await page.waitForURL(url => url.pathname === path);
    }
    await unlock();
    await navigate('/more');
    await navigate('/health/appointments');
    back();
    await page.waitForURL(url => url.pathname === '/more');
    evidence.checks.push({ name: 'unlocked Back preserves normal route history', passed: true });
    await navigate('/health/appointments');
    const deepRoute = route();
    adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
    launch();
    await until(() => foreground(), 'return after leave lock');
    await gate.waitFor();
    assert.equal(route(), deepRoute);
    evidence.midSessionBack = { before: resumedActivities() };
    back();
    try {
      await until(() => !foreground(), 'mid-session gate backgrounds app');
    } finally {
      evidence.midSessionBack.after = resumedActivities();
    }
    assert.equal(route(), deepRoute);
    launch();
    await until(() => foreground(), 'return to locked deep route');
    await gate.waitFor();
    assert.equal(route(), deepRoute);
    await unlock();
    assert.equal(route(), deepRoute);
    evidence.checks.push({ name: 'deep-route lock, Back, return, unlock keeps route', route: deepRoute, passed: true });
  }
  evidence.passed = true;
} catch (error) {
  evidence.passed = false;
  evidence.error = String(error);
  throw error;
} finally {
  writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  await connection?.close();
  if (forward) adb('forward', '--remove', `tcp:${forward}`);
}
