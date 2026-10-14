/* Actual foreground and WorkManager delivery, on an owned API-35 emulator.
   Build the auto-export probe and isolated debug/test APKs before running. */
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, appendFileSync, openSync, closeSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { startOwnedEmulator, assertOwnedEmulator, stopOwnedEmulator } from './emulator.mjs';

const avd = process.env.BACKUP_POWER_CUT_AVD;
const pkg = process.env.BACKUP_POWER_CUT_PACKAGE;
if (!avd || !/^(last-audit-backend-|backup-power-cut-)[a-z0-9-]+$/.test(avd)) throw new Error('supply an owned backup power-cut AVD');
if (!pkg || !/^dev\.engender\.app\.test\.[a-z0-9]+$/.test(pkg)) throw new Error('supply an isolated test package');
if (!/Max core file size\s+0\s+/.test(readFileSync('/proc/self/limits', 'utf8'))) throw new Error('set ulimit -c 0 before starting QEMU');
const port = Number(process.env.BACKUP_POWER_CUT_PORT ?? 5564);
const cdpPort = Number(process.env.BACKUP_POWER_CUT_CDP_PORT ?? 9346);
if (!Number.isInteger(port) || port < 5554 || port > 5682 || port % 2 || !Number.isInteger(cdpPort) || cdpPort < 1024) throw new Error('invalid owned ports');
const serial = `emulator-${port}`;
const sdk = process.env.ANDROID_HOME ?? join(process.env.HOME, 'Android/Sdk');
const adbBin = join(sdk, 'platform-tools/adb');
const out = process.env.BACKUP_POWER_CUT_OUTPUT ?? '/tmp/backup-power-cut';
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const adb = (...args) => execFileSync(adbBin, ['-s', serial, ...args], { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] });
const query = (args) => spawnSync(adbBin, ['-s', serial, ...args], { encoding: 'utf8', timeout: 5000 });
const attempt = (...args) => { try { return adb(...args).trim(); } catch { return ''; } };
const record = (value) => appendFileSync(join(out, 'results.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...value }) + '\n');
const progress = (step, note = '') => {
  if (process.env.BACKUP_POWER_CUT_PROGRESS) appendFileSync(process.env.BACKUP_POWER_CUT_PROGRESS, JSON.stringify({ at: new Date().toISOString(), ticket: '46', status: 'verifying', step, baseSha: process.env.BACKUP_POWER_CUT_BASE_SHA, note, cleanup: 'pending' }) + '\n');
};
let emulator;
let instrument;
let connection;
let observeCutBoot = false;
function inspectBootLedger() {
  const xml = attempt('shell', 'run-as', pkg, 'cat', 'shared_prefs/engender-auto-export.xml');
  const encoded = /<string name="verifiedBackups">([^<]*)<\/string>/.exec(xml)?.[1];
  if (!encoded) throw new Error('backup ownership ledger missing after power cut');
  const decoded = encoded.replaceAll('&quot;', '"').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&apos;', "'");
  const verified = JSON.parse(decoded);
  const sizes = verified.map((uri) => {
    const id = decodeURIComponent(new URL(uri).pathname.split('/').at(-1));
    if (!id.startsWith('primary:Documents/backend46-power-cut/')) throw new Error('boot proof refuses a foreign backup path');
    const stat = query(['shell', 'stat', '-c', '%s', `/sdcard/${id.slice('primary:'.length)}`]);
    return { uri, size: stat.status === 0 ? Number(stat.stdout.trim()) : null, status: stat.status, error: stat.stderr?.trim() };
  });
  record({ bootLedgerBeforeForeground: sizes, allRecordedFilesCompleteLength: sizes.length > 0 && sizes.every((item) => item.status === 0 && item.size >= 40 * 1024 * 1024) });
  if (!sizes.length || sizes.some((item) => item.status === 0 && item.size < 40 * 1024 * 1024)) throw new Error(`recorded backup truncated before foreground recovery: ${JSON.stringify(sizes)}`);
}
async function until(test, timeout, description) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeout) {
    try { const value = await test(); if (value) return value; } catch (error) { lastError = error; }
    await sleep(250);
  }
  throw new Error(`timeout: ${description}: ${lastError?.message ?? 'condition never became true'}`);
}
async function boot() {
  const log = openSync(join(out, 'emulator.log'), 'a');
  try {
    emulator = await startOwnedEmulator({ name: avd, query, timeout: 240000, launch: () => {
      emulator = spawn(join(sdk, 'emulator/emulator'), ['-avd', avd, '-port', String(port), '-gpu', 'host', '-no-snapshot', '-no-audio', '-no-boot-anim'], { stdio: ['ignore', log, log] });
      record({ resource: 'emulator', pid: emulator.pid, hostPid: process.pid, avd, serial, pkg, cdpPort });
      progress('booting owned backup power-cut emulator', `PID ${emulator.pid}; ${serial}`);
      return emulator;
    } });
  } finally { closeSync(log); }
  if (observeCutBoot) { inspectBootLedger(); observeCutBoot = false; }
  await sleep(8000);
  adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
  adb('shell', 'wm', 'dismiss-keyguard');
}
async function openProbe() {
  await connection?.close().catch(() => {});
  connection = undefined;
  adb('shell', 'am', 'force-stop', pkg);
  instrument?.kill();
  const instrumentLog = openSync(join(out, "instrument.log"), "a");
  instrument = spawn(adbBin, ['-s', serial, 'shell', 'am', 'instrument', '-w', '-e', 'class', 'dev.engender.app.backup.BackupPowerCutTest#powerCutHost', '-e', 'backupPowerCutHost', 'true', `${pkg}.test/androidx.test.runner.AndroidJUnitRunner`], { stdio: ['ignore', instrumentLog, instrumentLog] });
  closeSync(instrumentLog);
  let lastProbeLog = 0;
  return until(async () => {
    const pid = attempt('shell', 'pidof', pkg).split(' ')[0];
    if (!pid) return;
    adb('forward', `tcp:${cdpPort}`, `localabstract:webview_devtools_remote_${pid}`);
    connection = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`, { timeout: 5000, noDefaults: true });
    const page = connection.contexts()[0]?.pages()[0];
    if (page && await page.evaluate(() => Boolean(window.backupProbe?.ready && window.backupCutNative)).catch(() => false)) return page;
    if (page && Date.now() - lastProbeLog > 5000) {
      lastProbeLog = Date.now();
      record({ probeState: await page.evaluate(() => ({ url: location.href, ready: window.backupProbe?.ready, control: typeof window.backupCutNative, result: window.backupProbe?.result })).catch(() => null) });
    }
    await connection.close();
  }, 60000, 'production backup probe');
}
const state = (page) => page.evaluate(() => JSON.parse(window.backupCutNative.status()));
async function command(page, expression) {
  await page.evaluate((expression) => { void window.backupProbe[expression.name](...expression.args); }, expression);
  await page.waitForFunction(() => window.backupProbe.ready, undefined, { timeout: 180000 });
  return page.evaluate(() => window.backupProbe.result);
}
async function configureFolder(page) {
  if ((await state(page)).destinationUri?.includes('backend46-power-cut')) return;
  adb('shell', 'mkdir', '-p', '/sdcard/Documents/backend46-power-cut');
  await page.evaluate(() => { window.backupFolderPicked = null; void window.backupProbe.pickPowerCutDestination().then((result) => { window.backupFolderPicked = result; }); });
  const dump = () => { adb('shell', 'uiautomator', 'dump', '/data/local/tmp/backend46-picker.xml'); return adb('shell', 'cat', '/data/local/tmp/backend46-picker.xml'); };
  function tap(xml, pattern) {
    const node = [...xml.matchAll(/<node\b[^>]*>/g)].map((match) => match[0]).find((node) => pattern.test(node));
    if (!node) return false;
    const bounds = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node)?.slice(1).map(Number);
    if (!bounds) return false;
    adb('shell', 'input', 'tap', String(Math.round((bounds[0] + bounds[2]) / 2)), String(Math.round((bounds[1] + bounds[3]) / 2)));
    return true;
  }
  let enteredOwnedFolder = false;
  await until(async () => {
    if (await page.evaluate(() => window.backupFolderPicked?.picked).catch(() => false)) return true;
    const xml = dump();
    record({ pickerLabels: [...xml.matchAll(/(?:text|content-desc)="([^"<>]+)"/g)].map((match) => match[1]) });
    if (enteredOwnedFolder && /text="(?:USE THIS FOLDER|Use this folder)"/.test(xml)) tap(xml, /text="(?:USE THIS FOLDER|Use this folder)"/);
    else if (xml.includes('text="backend46-power-cut"')) { tap(xml, /text="backend46-power-cut"/); enteredOwnedFolder = true; }
    else if (xml.includes('text="Documents"')) tap(xml, /text="Documents"/);
    else if (/text="(?:ALLOW|Allow)"/.test(xml)) tap(xml, /text="(?:ALLOW|Allow)"/);
    else if (/text="(?:Pixel 7|sdk_gphone64_x86_64|Internal storage)"/.test(xml)) tap(xml, /text="(?:Pixel 7|sdk_gphone64_x86_64|Internal storage)"/);
    else tap(xml, /content-desc="Show roots"/);
    await sleep(700);
    return false;
  }, 90000, 'owned local SAF folder grant');
  attempt('shell', 'rm', '-f', '/data/local/tmp/backend46-picker.xml');
}
async function cut() {
  assertOwnedEmulator(emulator, avd, query);
  observeCutBoot = true;
  emulator.kill('SIGKILL');
  await until(() => emulator.exitCode !== null || emulator.signalCode !== null, 30000, 'QEMU exit');
  await connection?.close().catch(() => {}); connection = undefined; instrument?.kill();
  await until(() => attempt('get-state') !== 'device', 30000, 'adb disconnect');
}
async function verifyRecorded(page, count) {
  const after = await state(page);
  if (!after.verified.length) throw new Error('last good backup disappeared');
  const retained = after.verified.slice(-5);
  if (retained.some((uri) => !after.documents.some((item) => item.uri === uri))) throw new Error(`retained verified backup missing: ${JSON.stringify(after)}`);
  // Ownership is committed before retention. A cut can retain receipts for pruned older copies.
  after.prunedReceipts = after.verified.filter((uri) => !after.documents.some((item) => item.uri === uri));
  after.verified = after.verified.filter((uri) => after.documents.some((item) => item.uri === uri));
  for (const uri of after.verified) {
    const document = after.documents.find((item) => item.uri === uri);
    if (document.size < count * 1024 * 1024) throw new Error(`verified backup truncated: ${uri}`);
    await page.evaluate((uri) => window.backupCutNative.copyVerified(uri), uri);
    const restored = await command(page, { name: 'recover', args: [count] });
    if (restored.recovered !== count || restored.rows !== 3300 || !restored.decodedImage) throw new Error(`recorded Archive did not restore: ${JSON.stringify(restored)}`);
  }
  return after;
}
try {
  await boot();
  if (process.env.BACKUP_POWER_CUT_APK) adb('install', '-r', '-t', process.env.BACKUP_POWER_CUT_APK);
  if (process.env.BACKUP_POWER_CUT_TEST_APK) adb('install', '-r', '-t', process.env.BACKUP_POWER_CUT_TEST_APK);
  if (!process.argv.includes('--skip-faults')) {
    progress('checking both production owners against provider faults');
    const faults = execFileSync(adbBin, ['-s', serial, 'shell', 'am', 'instrument', '-w', '-e', 'class', 'dev.engender.app.backup.BackupDeliveryDurabilityTest#failedForegroundAndWorkerDeliveriesPreserveLastGood', `${pkg}.test/androidx.test.runner.AndroidJUnitRunner`], { encoding: 'utf8', timeout: 120000 });
    record({ nativeFaults: faults });
    if (!faults.includes('OK (1 test)')) throw new Error(`native delivery fault checks failed: ${faults}`);
  }
  let page = await openProbe();
  await configureFolder(page);
  const directory = await page.evaluate(() => JSON.parse(window.backupCutNative.measureDirectorySync()));
  record({ directorySync: directory, destination: (await state(page)).destinationUri });
  if (!directory?.synced) throw new Error('system provider directory sync unavailable');
  if (process.argv.includes('--inspect-only')) {
    record({ existingState: await state(page), restoreExisting: true });
    const inspected = await verifyRecorded(page, 40);
    record({ inspectExistingPass: true, verifiedArchivesRestored: inspected.verified.length });
  }
  if (!process.argv.includes('--setup-only') && !process.argv.includes('--inspect-only')) {
    const count = 40;
    for (let i = 0; i < 5; i++) {
      const result = await command(page, { name: 'run', args: [count] });
      if (result.result?.outcome !== 'ok') throw new Error(`baseline backup failed: ${JSON.stringify(result)}`);
    }
    await verifyRecorded(page, count);
    const retained = new Map([[2311, 9548], [2312, 7955], [2313, 9493], [2314, 7078]]);
    const seeds = process.env.BACKUP_POWER_CUT_SEEDS ? process.env.BACKUP_POWER_CUT_SEEDS.split(',').map(Number)
      : [...retained.keys(), ...Array.from({ length: 10 }, (_, i) => 4610 + i)];
    const paths = process.env.BACKUP_POWER_CUT_PATHS?.split(',') ?? ['foreground', 'worker'];
    if (!seeds.length || seeds.some((seed) => !Number.isInteger(seed) || seed < 1) || !paths.length || paths.some((path) => !['foreground', 'worker'].includes(path))) throw new Error('invalid requested backup cut cases');
    for (const path of paths) for (const seed of seeds) {
      page = await openProbe();
      const before = await state(page);
      adb('shell', 'sync'); // Persist fixtures, never the mutation under test.
      const random = createHash('sha256').update(`t09:${seed}`).digest().readUInt32BE(0) / 2 ** 32;
      const offsetMs = retained.get(seed) ?? Math.floor(random * 700);
      let staged;
      let started;
      if (path === 'worker') {
        const prepared = await command(page, { name: 'run', args: [count, true] });
        if (prepared.result?.outcome !== 'staged') throw new Error(`worker ciphertext was not deferred: ${JSON.stringify(prepared)}`);
        // Only scheduling is controlled; real BackupWork performs delivery and retention.
        staged = await page.evaluate(() => JSON.parse(window.backupCutNative.armWorker(200)));
        started = Date.now();
        adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
      } else {
        started = Date.now();
        await page.evaluate((count) => { void window.backupProbe.run(count); }, count);
        if (!retained.has(seed) && seed % 2 === 0) await page.waitForFunction(() => window.backupProbe.ready, undefined, { timeout: 180000 });
      }
      await sleep(offsetMs);
      const confirmation = path === 'foreground' ? await page.evaluate(() => window.backupProbe.ready && window.backupProbe.result?.result?.outcome === 'ok').catch(() => false) : null;
      const cutMs = Date.now() - started;
      await cut(); await boot(); page = await openProbe();
      const after = await verifyRecorded(page, count);
      const added = after.verified.filter((uri) => !before.verified.includes(uri));
      if (confirmation && !added.length) throw new Error(`confirmed backup lost at ${path} seed ${seed}`);
      if (!before.verified.some((uri) => after.verified.includes(uri))) throw new Error(`last good backup replaced at ${path} seed ${seed}`);
      record({ path, seed, offsetMs, cutMs, confirmedBeforeCut: confirmation, stagedLength: staged?.length, beforeSuccess: before.lastSuccessAt, afterSuccess: after.lastSuccessAt, added, verifiedAfterCut: after.verified.length, prunedOwnershipReceipts: after.prunedReceipts, allRetainedArchivesRestored: true });
      progress(`verified ${path} power-cut seed ${seed}`, `all ${after.verified.length} recorded Archives restored; offset ${offsetMs}ms`);
      console.log(`PASS ${path} seed ${seed}: ${after.verified.length} recorded Archives restored`);
    }
    console.log(`PASS ${paths.length * seeds.length} system-provider power cuts: ${paths.join(', ')}; seeds ${seeds.join(', ')}`);
  }
} finally {
  await connection?.close().catch(() => {});
  attempt('forward', '--remove', `tcp:${cdpPort}`);
  attempt('shell', 'rm', '-f', '/data/local/tmp/backend46-picker.xml');
  attempt('shell', 'am', 'force-stop', pkg); instrument?.kill();
  attempt('shell', 'sync');
  if (emulator) await stopOwnedEmulator(emulator, avd, query);
}
