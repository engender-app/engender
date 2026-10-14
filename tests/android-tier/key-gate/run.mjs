/* Build the key-gate probe and isolated APKs first. This runner owns no
   phone: its resource receipt must name a live disposable emulator. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const args = process.argv.slice(2);
const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const resourcePath = option('--resources');
const output = option('--output');
if (!resourcePath || !output) throw Error('Use --resources <owned emulator JSON> --output <evidence directory>');
const resources = JSON.parse(readFileSync(resourcePath, 'utf8'));
const { serial, avd, pid: emulatorPid, package: pkg, cdpPort } = resources;
assert.match(serial, /^emulator-\d+$/);
assert.match(pkg, /^dev\.engender\.app\.test\.[a-zA-Z0-9_]+$/);
assert.ok(Number.isInteger(cdpPort) && cdpPort >= 1024 && cdpPort < 65536);
const command = readFileSync(`/proc/${emulatorPid}/cmdline`, 'utf8').split('\0');
assert.equal(command[command.indexOf('-avd') + 1], avd);
assert.equal(command[command.indexOf('-port') + 1], serial.slice('emulator-'.length));
const adb = join(process.env.ANDROID_HOME ?? join(homedir(), 'Android/Sdk'), 'platform-tools/adb');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
mkdirSync(output, { recursive: true });
let instrument, connection;
const evidence = { serial, avd, sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() };

function device(...args) {
  const name = execFileSync(adb, ['-s', serial, 'emu', 'avd', 'name'], { encoding: 'utf8' }).replaceAll('\r', '').trim();
  assert.equal(name, avd + '\nOK', 'emulator ownership changed');
  return execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8', timeout: 20_000, stdio: ['ignore', 'pipe', 'pipe'] });
}
async function until(fn, label, timeout = 30_000) {
  const start = Date.now(); let last;
  while (Date.now() - start < timeout) {
    try { const value = await fn(); if (value) return value; } catch (error) { last = error; }
    await sleep(100);
  }
  throw Error(`Timed out: ${label}; ${last ?? ''}`);
}
async function closeHost() {
  await connection?.close().catch(() => {}); connection = undefined;
  device('shell', 'am', 'force-stop', pkg);
  if (instrument && instrument.exitCode === null) instrument.kill('SIGTERM');
  instrument = undefined;
  try { device('forward', '--remove', `tcp:${cdpPort}`); } catch { /* Already absent. */ }
}
async function openHost() {
  await closeHost();
  const log = openSync(join(output, 'host.log'), 'a');
  instrument = spawn(adb, ['-s', serial, 'shell', 'am', 'instrument', '-w', '-e', 'class',
    'dev.engender.app.keystore.KeystorePromptLifecycleTest#coldGateHost', '-e', 'keyGateHost', 'true',
    `${pkg}.test/androidx.test.runner.AndroidJUnitRunner`], { stdio: ['ignore', log, log] });
  closeSync(log);
  return until(async () => {
    assert.equal(instrument.exitCode, null, 'probe host ended');
    const pid = device('shell', 'pidof', pkg).trim();
    if (!pid) return false;
    device('forward', `tcp:${cdpPort}`, `localabstract:webview_devtools_remote_${pid}`);
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`, { timeout: 2000, noDefaults: true });
    const page = browser.contexts()[0]?.pages()[0];
    if (page && await page.evaluate(() => Boolean(window.keyGateProbe)).catch(() => false)) {
      connection = browser;
      return page;
    }
    await browser.close(); return false;
  }, 'cold gate host', 60_000);
}
const snapshot = page => page.evaluate(() => ({ ...window.keyGateProbe.snapshot(),
  credentialDisabled: document.querySelector('[data-key-device-credential]')?.disabled ?? null }));
const save = () => writeFileSync(join(output, 'summary.json'), JSON.stringify(evidence, null, 2) + '\n');
async function awaitPrompt() {
  await until(() => {
    device('shell', 'uiautomator', 'dump', '/sdcard/key-gate-probe.xml');
    return device('shell', 'cat', '/sdcard/key-gate-probe.xml').includes('com.android.systemui:id/biometric_icon');
  }, 'visible platform biometric prompt');
}

try {
  // The isolated package is disposable; no other package or device state is cleared.
  device('shell', 'pm', 'clear', pkg);
  let page = await openHost();
  await page.evaluate(() => window.keyGateProbe.seed());
  assert.equal(await page.evaluate(() => window.keyGateProbe.seeded), true, JSON.stringify(await snapshot(page)));
  evidence.seeded = true;

  page = await openHost();
  await page.waitForFunction(() => window.keyGateProbe.snapshot().status === 'needs-authentication');
  device('shell', 'input', 'keyevent', 'KEYCODE_HOME');
  await sleep(1500);
  evidence.afterHome = await page.evaluate(() => ({ saved: window.keyGateNativeSaved, visibility: document.visibilityState }));
  save();
  await page.waitForFunction(() => window.keyGateNativeSaved === true && document.visibilityState === 'hidden');
  evidence.beforeMount = await page.evaluate(() => ({ saved: window.keyGateNativeSaved, visibility: document.visibilityState }));
  await page.evaluate(() => { void window.keyGateProbe.mount(); });
  await sleep(2000);
  evidence.stopped = await snapshot(page);
  device('shell', 'am', 'start', '-n', `${pkg}/dev.engender.app.disguise.LauncherDefault`);
  await page.waitForFunction(() => window.keyGateNativeSaved === false && document.visibilityState === 'visible');
  await sleep(500);
  evidence.returned = await snapshot(page);
  save();
  assert.equal(evidence.returned.disabled, false, 'gate stayed busy after a prompt could not start');
  assert.equal(evidence.returned.outcome, 'cancelled');
  assert.equal(evidence.returned.status, 'needs-authentication');
  assert.equal(evidence.returned.error, '');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => window.keyGateProbe.theme(theme), theme);
    await page.screenshot({ path: join(output, `gate-${theme}.png`) });
  }
  await page.locator('[data-key-retry]').click();
  await until(async () => (await snapshot(page)).disabled, 'retry starts a real prompt');
  await awaitPrompt();
  device('emu', 'finger', 'touch', '1');
  await sleep(1000);
  evidence.afterTouch = await snapshot(page);
  save();
  await page.waitForFunction(() => window.keyGateProbe.snapshot().status === 'ready');
  evidence.retried = await snapshot(page);
  evidence.retained = await page.evaluate(() => window.keyGateProbe.retainedEntry());
  assert.equal(evidence.retained, 'Saved-state gate fixture');

  page = await openHost();
  await page.evaluate(() => { void window.keyGateProbe.mount(); });
  await until(async () => (await snapshot(page)).disabled, 'ordinary prompt starts');
  await awaitPrompt();
  device('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await page.waitForFunction(() => window.keyGateProbe.snapshot().outcome === 'cancelled' && !window.keyGateProbe.snapshot().disabled);
  evidence.cancelled = await snapshot(page);
  await page.locator('[data-key-retry]').click();
  await until(async () => (await snapshot(page)).disabled, 'lockout control starts a prompt');
  await awaitPrompt();
  for (let attempt = 0; attempt < 10 && (await snapshot(page)).outcome !== 'lockedOut'; attempt++) {
    device('emu', 'finger', 'touch', '99');
    await sleep(1000);
  }
  await page.waitForFunction(() => window.keyGateProbe.snapshot().outcome === 'lockedOut'
    && document.querySelector('[data-key-device-credential]')?.disabled === false);
  evidence.lockedOut = await snapshot(page);
  evidence.passed = true;
  save();
  console.log(JSON.stringify(evidence));
} catch (error) {
  evidence.error = String(error);
  save();
  throw error;
} finally {
  device('shell', 'rm', '-f', '/sdcard/key-gate-probe.xml');
  await closeHost();
}
