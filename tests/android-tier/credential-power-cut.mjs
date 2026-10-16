/* Real API-35 power cuts over the production PIN/passphrase flows.
   Build the credential-power-cut probe and isolated APKs first. The supplied
   AVD and package must belong to this run; no physical device is accepted. */
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, appendFileSync, openSync, closeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
import { join } from 'node:path';
import { startOwnedEmulator, assertOwnedEmulator, stopOwnedEmulator } from './emulator.mjs';

const avd = process.env.CREDENTIAL_POWER_CUT_AVD;
const pkg = process.env.CREDENTIAL_POWER_CUT_PACKAGE;
if (!avd || !/^(last-audit-backend-|credential-power-cut-)[a-z0-9-]+$/.test(avd)) throw new Error('supply an owned power-cut AVD');
if (!pkg || !/^dev\.engender\.app\.test\.[a-z0-9]+$/.test(pkg)) throw new Error('supply an isolated test package');
const port = Number(process.env.CREDENTIAL_POWER_CUT_PORT ?? 5562);
const cdpPort = Number(process.env.CREDENTIAL_POWER_CUT_CDP_PORT ?? 9345);
if (!Number.isInteger(port) || port < 5554 || port > 5682 || port % 2 || !Number.isInteger(cdpPort) || cdpPort < 1024) throw new Error('invalid owned ports');
const serial = `emulator-${port}`;
const sdk = process.env.ANDROID_HOME ?? join(process.env.HOME, 'Android/Sdk');
const adbBin = join(sdk, 'platform-tools/adb');
const emulatorBin = join(sdk, 'emulator/emulator');
const out = process.env.CREDENTIAL_POWER_CUT_OUTPUT ?? '/tmp/credential-power-cut';
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const adb = (...args) => execFileSync(adbBin, ['-s', serial, ...args], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] });
const query = (args) => spawnSync(adbBin, ['-s', serial, ...args], { encoding: 'utf8', timeout: 5000 });
const attempt = (...args) => { try { return adb(...args).trim(); } catch { return ''; } };
const record = (value) => appendFileSync(join(out, 'results.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...value }) + '\n');
const progress = (step, note = '') => {
  if (process.env.CREDENTIAL_POWER_CUT_PROGRESS) appendFileSync(process.env.CREDENTIAL_POWER_CUT_PROGRESS, JSON.stringify({ at: new Date().toISOString(), ticket: '45', status: 'verifying', step, baseSha: process.env.CREDENTIAL_POWER_CUT_BASE_SHA, note, cleanup: 'pending' }) + '\n');
};
let emulator;
let instrument;
let connection;
const heartbeat = setInterval(() => progress('running seeded Android power cuts', `AVD ${avd}; ${serial}; package ${pkg}`), 45000);

async function until(test, timeout, description) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeout) {
    try { const value = await test(); if (value) return value; } catch {}
    await sleep(300);
  }
  throw new Error(`timeout: ${description}: ${lastError?.message ?? 'condition never became true'}`);
}

async function boot() {
  const log = openSync(join(out, 'emulator.log'), 'a');
  try {
    emulator = await startOwnedEmulator({
      name: avd, query, timeout: 240000,
      launch: () => {
        emulator = spawn(emulatorBin, ['-avd', avd, '-port', String(port), '-gpu', 'host', '-no-snapshot', '-no-audio', '-no-boot-anim'], { stdio: ['ignore', log, log] });
        record({ resource: 'emulator', pid: emulator.pid, hostPid: process.pid, avd, serial, pkg, cdpPort });
        progress('booting owned power-cut emulator', `PID ${emulator.pid}; ${serial}`);
        return emulator;
      }
    });
  } finally { closeSync(log); }
  // API35 may recreate activities while boot configuration settles.
  await sleep(8000);
  adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
  adb('shell', 'wm', 'dismiss-keyguard');
}

async function openProbe() {
  adb('shell', 'am', 'force-stop', pkg);
  instrument?.kill();
  instrument = spawn(adbBin, ['-s', serial, 'shell', 'am', 'instrument', '-w', '-e', 'class', 'dev.engender.app.keystore.CredentialWrapStoreTest#powerCutHost', '-e', 'powerCutHost', 'true', `${pkg}.test/androidx.test.runner.AndroidJUnitRunner`], { stdio: 'ignore' });
  return until(async () => {
    const pid = attempt('shell', 'pidof', pkg).split(' ')[0];
    if (!pid) return;
    adb('forward', `tcp:${cdpPort}`, `localabstract:webview_devtools_remote_${pid}`);
    connection = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`, { timeout: 5000, noDefaults: true });
    const page = connection.contexts()[0]?.pages()[0];
    if (page && await page.evaluate(() => Boolean(window.__credentialPowerCut)).catch(() => false)) return page;
    await connection.close();
  }, 60000, 'production credential probe');
}

async function cut() {
  // SIGKILL the owned QEMU process: no guest shutdown or host snapshot save.
  assertOwnedEmulator(emulator, avd, query);
  emulator.kill('SIGKILL');
  await until(() => emulator.exitCode !== null || emulator.signalCode !== null, 30000, 'QEMU exit');
  await connection?.close().catch(() => {});
  connection = undefined;
  instrument?.kill();
  await until(() => attempt('get-state') !== 'device', 30000, 'adb disconnect');
}

try {
  await boot();
  if (process.env.CREDENTIAL_POWER_CUT_APK) adb('install', '-r', process.env.CREDENTIAL_POWER_CUT_APK);
  if (process.env.CREDENTIAL_POWER_CUT_TEST_APK) adb('install', '-r', process.env.CREDENTIAL_POWER_CUT_TEST_APK);
  const fault = adb('shell', 'am', 'instrument', '-w', '-e', 'class', 'dev.engender.app.keystore.CredentialWrapStoreTest', `${pkg}.test/androidx.test.runner.AndroidJUnitRunner`);
  if (!fault.includes('OK (5 tests)')) throw new Error(`native fault checks failed: ${fault}`);
  record({ nativeFaults: 'OK (5 tests)' });
  for (const type of ['passphrase', 'pin']) {
    let page = await openProbe();
    await page.evaluate((type) => window.__credentialPowerCut.seed(type), type);
    const fixtures = await page.evaluate((type) => window.__credentialPowerCut.failureFixtures(type), type);
    const old = Buffer.from(fixtures.old).toString('base64');
    const next = Buffer.from(fixtures.next).toString('base64');
    adb('shell', 'sync');
    const args = ['-e', 'old', old, '-e', 'next', next];
    await connection?.close().catch(() => {});
    adb('shell', 'am', 'force-stop', pkg);
    instrument?.kill();
    const prepared = adb('shell', 'am', 'instrument', '-w', '-e', 'class', 'dev.engender.app.keystore.CredentialWrapFailureRestartTest#prepareFailedPersistence', ...args, `${pkg}.test/androidx.test.runner.AndroidJUnitRunner`);
    if (!prepared.includes('OK (1 test)')) throw new Error(`failed-persistence setup did not run: ${prepared}`);
    record({ failurePrepared: type, confirmationPrevented: true });
    await cut();
    await boot();
    const restarted = adb('shell', 'am', 'instrument', '-w', '-e', 'class', 'dev.engender.app.keystore.CredentialWrapFailureRestartTest#verifyAuthorityAfterRestart', ...args, `${pkg}.test/androidx.test.runner.AndroidJUnitRunner`);
    if (!restarted.includes('OK (1 test)')) throw new Error(`failed-persistence restart refused: ${restarted}`);
    page = await openProbe();
    const after = await page.evaluate((type) => window.__credentialPowerCut.verify(type), type);
    if (after.oldOpens === after.newOpens || after.source !== type) throw new Error(`failed-persistence restart lost the journal: ${JSON.stringify(after)}`);
    record({ failedPersistenceRestart: type, confirmationPrevented: true, authorityVerifiedAfterPowerCut: true, ...after });
    progress(`verified failed ${type} persistence after QEMU restart`, `old=${after.oldOpens}; new=${after.newOpens}; confirmation prevented`);
  }
  if (!process.argv.includes('--failure-restart')) {
  for (const type of ['passphrase', 'pin']) {
    for (let i = 0; i < 20; i++) {
      const seed = (type === 'pin' ? 4500 : 4600) + i;
      const confirmedCut = i >= 10;
      const offsetMs = createHash('sha256').update(`credential:${seed}`).digest().readUInt32BE(0) % (confirmedCut ? 200 : 450);
      let page = await openProbe();
      // Two seeds exercise adoption from the released OPFS serialization.
      const legacy = i === 0 || i === 10;
      if (legacy) adb('shell', 'run-as', pkg, 'rm', '-f', 'files/journal-credential.json');
      await page.evaluate(({ type, legacy }) => window.__credentialPowerCut.seed(type, legacy), { type, legacy });
      const baseline = await page.evaluate((type) => window.__credentialPowerCut.verify(type), type);
      if (!baseline.oldOpens || baseline.newOpens) throw new Error(`invalid seed fixture ${seed}`);
      // A power cut tests this mutation, not durability of its seed fixture.
      adb('shell', 'sync');
      const started = Date.now();
      await page.evaluate((type) => { void window.__credentialPowerCut.change(type).catch(() => {}); }, type);
      if (confirmedCut) await page.waitForFunction(() => window.__credentialPowerCut.confirmed || window.__credentialPowerCut.error, undefined, { timeout: 60000 });
      await sleep(offsetMs);
      const before = await page.evaluate(() => ({ confirmed: window.__credentialPowerCut.confirmed, error: window.__credentialPowerCut.error }));
      if (before.error) throw new Error(before.error);
      const cutMs = Date.now() - started;
      await cut();
      await boot();
      page = await openProbe();
      const after = await page.evaluate((type) => window.__credentialPowerCut.verify(type), type);
      const usable = after.oldOpens !== after.newOpens;
      const durableConfirmation = !before.confirmed || (after.newOpens && !after.oldOpens);
      record({ seed, type, offsetMs, cutMs, legacy, confirmedBeforeCut: before.confirmed, ...after, usable, durableConfirmation });
      progress(`verified ${type} power-cut seed ${seed}`, `confirmed=${before.confirmed}; old=${after.oldOpens}; new=${after.newOpens}`);
      console.log(JSON.stringify({ seed, type, confirmed: before.confirmed, ...after }));
      if (!usable || !durableConfirmation || after.source !== type) throw new Error(`power-cut invariant failed at seed ${seed}`);
    }
  }
  console.log('PASS 40 seeded QEMU power cuts: 20 passphrase, 20 PIN');
  }
  console.log('PASS failed persistence and QEMU restart: passphrase and PIN');
} finally {
  clearInterval(heartbeat);
  await connection?.close().catch(() => {});
  attempt('forward', '--remove', `tcp:${cdpPort}`);
  attempt('shell', 'am', 'force-stop', pkg);
  instrument?.kill();
  if (emulator) await stopOwnedEmulator(emulator, avd, query);
}
