/* An owned emulator and isolated package only. Build the pin-count probe and
   Android test APK first; this runner never touches a physical phone. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';

const args = process.argv.slice(2);
const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const root = resolve(import.meta.dirname, '../../..');
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
mkdirSync(output, { recursive: true });
const adb = join(process.env.ANDROID_HOME ?? join(homedir(), 'Android/Sdk'), 'platform-tools/adb');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let instrument, connection;
const rows = [];
const progressPath = option('--progress');
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
function progress(step) {
  console.log(step);
  if (progressPath) appendFileSync(progressPath, JSON.stringify({ at: new Date().toISOString(), ticket: '15',
    status: 'verifying', step, baseSha: option('--base') ?? sourceSha, note: 'isolated Android native PIN ledger proof', cleanup: 'pending' }) + '\n');
}
function device(...args) {
  assert.ok(existsSync(`/proc/${emulatorPid}`), 'owned emulator absent');
  const name = execFileSync(adb, ['-s', serial, 'emu', 'avd', 'name'], { encoding: 'utf8' }).replaceAll('\r', '').trim();
  assert.equal(name, avd + '\nOK', 'emulator ownership changed');
  return execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8', timeout: 20_000, stdio: ['ignore', 'pipe', 'pipe'] });
}
function attempt(...args) { try { return device(...args).trim(); } catch { return ''; } }
async function until(fn, timeout, label) {
  const started = Date.now(); let error;
  while (Date.now() - started < timeout) {
    try { const result = await fn(); if (result) return result; } catch (failure) { error = failure; }
    await sleep(100);
  }
  throw Error(`Timed out: ${label}; ${error ?? ''}`);
}
async function disconnect() {
  await connection?.close().catch(() => {}); connection = undefined;
  if (instrument && instrument.exitCode === null) instrument.kill('SIGTERM');
  instrument = undefined;
  attempt('forward', '--remove', `tcp:${cdpPort}`);
}
async function openHost(preserveProcess = false) {
  await disconnect();
  if (!preserveProcess) device('shell', 'am', 'force-stop', pkg);
  const log = openSync(join(output, 'host.log'), 'a');
  instrument = spawn(adb, ['-s', serial, 'shell', 'am', 'instrument', '-w', '-e', 'class',
    'dev.engender.app.keystore.CredentialWrapStoreTest#powerCutHost', '-e', 'powerCutHost', 'true',
    '-e', 'probeBundle', 'pin-count-probe', `${pkg}.test/androidx.test.runner.AndroidJUnitRunner`], { stdio: ['ignore', log, log] });
  closeSync(log);
  resources.instrumentPid = instrument.pid; writeFileSync(resourcePath, JSON.stringify(resources));
  return until(async () => {
    assert.equal(instrument.exitCode, null, 'probe host ended before a WebView was ready');
    const pid = attempt('shell', 'pidof', pkg).split(' ')[0]; if (!pid) return false;
    device('forward', `tcp:${cdpPort}`, `localabstract:webview_devtools_remote_${pid}`);
    connection = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`, { timeout: 2000, noDefaults: true });
    const page = connection.contexts()[0]?.pages()[0];
    if (page && await page.evaluate(() => Boolean(window.__pinCount)).catch(() => false)) return page;
    await connection.close(); connection = undefined; return false;
  }, 60_000, 'PIN probe host');
}
const snapshot = page => page.evaluate(() => window.__pinCount.snapshot());
async function enter(page, pin = '0000') {
  await until(() => page.locator('[data-key="0"]').isEnabled(), 70_000, 'ready PIN gate');
  for (const digit of pin) await page.locator(`[data-key="${digit}"]`).click();
  return until(async () => {
    const state = await snapshot(page);
    return ['wrong', 'throttled'].includes(state.status) || state.verified === 'ok' ? state : false;
  }, 15_000, 'acknowledged PIN outcome');
}
async function cut(page, kind, delay = 0) {
  const before = await snapshot(page);
  const bootBefore = device('shell', 'cat', '/proc/sys/kernel/random/boot_id').trim();
  const pid = device('shell', 'pidof', pkg).trim(); assert.match(pid, /^\d+$/, 'one live app PID required');
  const observedAt = Date.now(); await sleep(delay);
  let closure;
  if (kind === 'kill' || kind === 'force-stop') {
    if (kind === 'kill') device('shell', 'run-as', pkg, 'kill', '-9', pid);
    else device('shell', 'am', 'force-stop', pkg);
    await until(() => !attempt('shell', 'pidof', pkg), 5000, 'terminated app PID');
  } else if (kind === 'dismiss') {
    await page.evaluate(() => { void window.Capacitor.nativePromise('App', 'exitApp', {}); }).catch(() => {});
    await until(() => !device('shell', 'dumpsys', 'activity', 'activities').split('\n')
      .some(line => line.includes('Hist #') && line.includes(pkg + '/')), 10_000, 'owned activity closed');
    closure = { activityClosed: true, forceStopped: false, pidAfter: attempt('shell', 'pidof', pkg) };
    await until(() => instrument.exitCode !== null, 10_000, 'dismissed instrumentation ended');
  } else if (kind === 'reboot') {
    await disconnect(); device('reboot');
    await until(() => attempt('shell', 'getprop', 'sys.boot_completed') === '1' &&
      attempt('shell', 'cat', '/proc/sys/kernel/random/boot_id') !== bootBefore, 120_000, 'changed boot ID');
    await sleep(5000);
  } else throw Error('Unknown lifecycle cut');
  const completedAt = Date.now(); await disconnect();
  let restoredPage;
  try { restoredPage = await openHost(kind === 'dismiss'); }
  catch (error) { if (kind !== 'reboot') throw error; progress('retrying host after reboot readiness'); restoredPage = await openHost(); }
  await restoredPage.evaluate(() => window.__pinCount.mount());
  const restored = await snapshot(restoredPage);
  const bootAfter = device('shell', 'cat', '/proc/sys/kernel/random/boot_id').trim();
  assert.equal(bootBefore === bootAfter, kind !== 'reboot', 'boot identity must match lifecycle case');
  return { page: restoredPage, proof: { kind, delay, actualCutWindowMs: completedAt - observedAt, pid,
    before, restored, closure, bootBefore, bootAfter } };
}
async function seeded(baseCount) {
  let page = await openHost(); await page.evaluate(() => window.__pinCount.seed());
  await page.evaluate(() => window.__pinCount.mount());
  for (let count = 0; count < baseCount; count++) await enter(page);
  const pending = await snapshot(page); await sleep(pending.native.remainingMs + 100);
  ({ page } = await cut(page, 'force-stop'));
  const durable = await snapshot(page);
  assert.equal(durable.native.wrongAttempts, baseCount, 'base count must survive a separate WebView');
  await sleep(durable.native.remainingMs + 100);
  return { page, durable };
}
function record(row) { rows.push(row); appendFileSync(join(output, 'results.jsonl'), JSON.stringify(row) + '\n'); console.log(JSON.stringify(row)); }
try {
  progress('installing isolated repaired PIN ledger APKs');
  device('install', '-r', '-t', join(root, 'android/app/build/outputs/apk/debug/app-debug.apk'));
  device('install', '-r', '-t', join(root, 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'));
  const versions = { sourceSha, android: device('shell', 'getprop', 'ro.build.version.release').trim(),
    sdk: device('shell', 'getprop', 'ro.build.version.sdk').trim(),
    webview: device('shell', 'dumpsys', 'webviewupdate').split('\n').find(line => line.includes('Current WebView package'))?.trim() };
  writeFileSync(join(output, 'versions.json'), JSON.stringify(versions, null, 2));
  if (!args.includes('--derivation-only')) for (const baseCount of [0, 1, 3]) for (const kind of ['kill', 'force-stop', 'dismiss', 'reboot']) {
    progress(`after-failure ${kind} over count ${baseCount}`);
    let { page, durable } = await seeded(baseCount);
    const failed = await enter(page); assert.equal(failed.native.wrongAttempts, baseCount + 1);
    const result = await cut(page, kind, kind === 'kill' ? 0 : 300); page = result.page;
    assert.equal(result.proof.restored.native.wrongAttempts, baseCount + 1);
    await sleep(result.proof.restored.native.remainingMs + 100);
    const next = await enter(page); assert.equal(next.native.wrongAttempts, baseCount + 2);
    assert.equal(next.native.fullDelayMs, Math.min(1000 * 2 ** baseCount, 60_000));
    record({ scenario: 'after-failure', baseCount, durable, failed, ...result.proof, next });
  }
  if (!args.includes('--derivation-only')) for (const stage of ['before-unlock', 'admitted']) for (const baseCount of [0, 3])
    for (const kind of stage === 'admitted' ? ['kill', 'force-stop', 'dismiss', 'reboot'] : ['kill', 'force-stop']) {
      progress(`${stage} ${kind} over count ${baseCount}`);
      let { page, durable } = await seeded(baseCount);
      await page.evaluate(stage => {
        window.__pinCount.holdBeforeVerification = stage === 'before-unlock';
        window.__pinCount.holdAfterAdmission = stage === 'admitted';
      }, stage);
      for (let n = 0; n < 4; n++) await page.locator('[data-key="0"]').click();
      await until(() => page.evaluate(stage => stage === 'admitted' ? window.__pinCount.admitted : window.__pinCount.started, stage), 15_000, stage);
      const interrupted = await snapshot(page); assert.equal(interrupted.verified, '');
      const expected = baseCount + (stage === 'admitted' ? 1 : 0);
      assert.equal(interrupted.native.wrongAttempts, expected);
      const result = await cut(page, kind); page = result.page;
      assert.equal(result.proof.restored.native.wrongAttempts, expected);
      await sleep(result.proof.restored.native.remainingMs + 100);
      const next = await enter(page); assert.equal(next.native.wrongAttempts, expected + 1);
      record({ scenario: stage, baseCount, durable, interrupted, ...result.proof, next });
    }
  for (const baseCount of [0, 3]) {
    progress(`interrupted real derivation over count ${baseCount}`);
    let { page, durable } = await seeded(baseCount);
    await page.evaluate(() => { window.__pinCount.holdDerivationReply = true; });
    for (let n = 0; n < 4; n++) await page.locator('[data-key="0"]').click();
    await until(() => page.evaluate(() => window.__pinCount.derivationCompleted), 15_000, 'real KDF response held');
    const deriving = await snapshot(page);
    assert.equal(deriving.verified, ''); assert.equal(deriving.derivationPosted, true);
    assert.equal(deriving.native.wrongAttempts, baseCount + 1);
    const result = await cut(page, 'kill'); page = result.page;
    assert.equal(result.proof.restored.native.wrongAttempts, baseCount + 1);
    await sleep(result.proof.restored.native.remainingMs + 100);
    const next = await enter(page); assert.equal(next.native.wrongAttempts, baseCount + 2);
    record({ scenario: 'interrupted-derivation', baseCount, durable, deriving, ...result.proof, next });
  }
  if (!args.includes('--derivation-only')) for (const stage of ['admission', 'settlement']) {
    progress(`failed ${stage} persistence refuses acknowledgement`);
    let { page } = await seeded(1);
    if (stage === 'settlement') {
      await page.evaluate(() => { window.__pinCount.holdAfterAdmission = true; });
      for (let n = 0; n < 4; n++) await page.locator('[data-key="0"]').click();
      await until(() => page.evaluate(() => window.__pinCount.admitted), 15_000, 'durable admission');
    }
    device('shell', 'run-as', pkg, 'mkdir', 'files/pin-attempts.json.new');
    try {
      if (stage === 'settlement') await page.evaluate(() => window.__pinCount.releaseVerification());
      else for (let n = 0; n < 4; n++) await page.locator('[data-key="0"]').click();
      await until(async () => (await snapshot(page)).status === 'access-unavailable', 15_000, 'persistence refusal');
      const refused = await snapshot(page); assert.equal(refused.verified, '');
      assert.equal(refused.native.wrongAttempts, stage === 'admission' ? 1 : 2);
      const result = await cut(page, 'kill');
      assert.equal(result.proof.restored.native.wrongAttempts, stage === 'admission' ? 1 : 2);
      record({ scenario: `${stage}-failure`, refused, ...result.proof });
    } finally { attempt('shell', 'run-as', pkg, 'rmdir', 'files/pin-attempts.json.new'); }
  }
  if (!args.includes('--derivation-only')) {
  progress('successful authentication resets durably and rejects a stale local mirror');
  let { page } = await seeded(3);
  const success = await enter(page, '1234'); assert.equal(success.native.wrongAttempts, 0);
  await page.evaluate(() => localStorage.setItem('engender-pin-attempts', JSON.stringify({ wrongAttempts: 99, acceptingFrom: Date.now() + 60_000 })));
  const reset = await cut(page, 'reboot'); assert.equal(reset.proof.restored.native.wrongAttempts, 0);
  assert.equal(reset.proof.restored.native.remainingMs, 0);
  record({ scenario: 'successful-reset', success, ...reset.proof });
  }
} finally {
  await disconnect(); attempt('shell', 'am', 'force-stop', pkg);
  writeFileSync(join(output, 'summary.json'), JSON.stringify({ sourceSha, passedCases: rows.length, rows }, null, 2));
}
