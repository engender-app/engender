import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { alarmState, assertFilledState, assertUpgradeState, compareUpgradeState, droppedTables } from './installed-upgrade-state.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packageId = 'dev.engender.app.test.upgrade40';
const [serial, avd, manifestPath, portText = '9340'] = process.argv.slice(2);
if (!/^emulator-\d+$/.test(serial ?? '') || !avd || !manifestPath || !/^\d+$/.test(portText)) {
  throw new Error('Usage: npm run test:android:upgrade -- emulator-NNNN named-avd manifest.json [unused-CDP-port]');
}
const port = Number(portText);
if (port < 1024 || port > 65535) throw new Error('Installed-upgrade CDP port must be 1024..65535');
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(process.env.HOME, 'Android/Sdk');
const adb = join(sdk, 'platform-tools/adb');
const buildTools = readdirSync(join(sdk, 'build-tools')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1);
const aapt = join(sdk, 'build-tools', buildTools, 'aapt');
const run = (command, args, options = {}) => execFileSync(command, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 128 * 1024 * 1024, ...options });
const query = (...args) => run(adb, ['-s', serial, ...args]);
const assertDevice = () => {
  if (query('emu', 'avd', 'name').trim().split(/\r?\n/)[0] !== avd) throw new Error('Installed-upgrade emulator identity changed');
};
const device = (...args) => { assertDevice(); return query(...args); };
assertDevice();
if (run(adb, ['forward', '--list']).split('\n').some((line) => line.split(/\s+/)[1] === `tcp:${port}`)) {
  throw new Error('Installed-upgrade CDP port is already forwarded');
}
const manifest = JSON.parse(readFileSync(resolve(manifestPath), 'utf8'));
const manifestDir = dirname(resolve(manifestPath));
const { beginAndroidTier, writeAndroidTierEvidence } = await import('../../scripts/android-tier-evidence.mjs');
const start = beginAndroidTier(repo);
if (manifest.sourceStart?.revision !== start.revision || !Number.isFinite(Date.parse(manifest.sourceStart?.startedAt))
  || Date.parse(manifest.sourceStart.startedAt) > Date.parse(start.startedAt)) throw new Error('Installed-upgrade kit lacks this source identity captured before its build');
const apks = {};
for (const [name, patch] of [['previous', null], ['healthy', null], ['rowDeleting', 'loss-migration-side-effect'], ['failing', 'loss-migration']]) {
  const input = manifest.upgradeApks?.[name];
  if (!input || input.packageId !== packageId || input.patch !== patch || !/^[a-f0-9]{40}$/.test(input.sourceRevision)) {
    throw new Error(`Invalid installed-upgrade provenance: ${name}`);
  }
  if (name !== 'previous' && input.sourceRevision !== start.revision) throw new Error(`${name} APK does not identify this source`);
  const path = resolve(manifestDir, input.path);
  const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex');
  const metadata = /package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/.exec(run(aapt, ['dump', 'badging', path]));
  if (sha256 !== input.sha256 || !metadata || metadata[1] !== packageId || Number(metadata[2]) !== input.versionCode || metadata[3] !== input.versionName) {
    throw new Error(`Installed-upgrade APK identity mismatch: ${name}`);
  }
  apks[name] = { ...input, path };
}
if (new Set(Object.values(apks).map((apk) => apk.sha256)).size !== 4) throw new Error('Installed-upgrade needs four distinct APKs');
if (!(apks.healthy.versionCode > apks.previous.versionCode) || apks.rowDeleting.versionCode < apks.healthy.versionCode
  || apks.failing.versionCode < apks.healthy.versionCode) throw new Error('Installed-upgrade APK versions do not define an upgrade');
const released = run('git', ['rev-parse', 'v1.0.0-rc.1^{commit}'], { cwd: repo }).trim();
if (apks.previous.sourceRevision !== released || apks.previous.versionName !== '1.0.0-rc.1') throw new Error('Previous APK is not the released rc.1 source');
const sourceVersion = Math.max(...[...readFileSync(join(repo, 'src/lib/data/sqlite/migrations.ts'), 'utf8').matchAll(/version:\s*(\d+)/g)].map((match) => Number(match[1])));
if (manifest.expectedVersion !== sourceVersion || sourceVersion <= 88) throw new Error('Installed-upgrade expected schema does not match this source');
// Tables the migrations after the released schema drop, read from the source under test; their rows are not compared.
const sqliteDir = join(repo, 'src/lib/data/sqlite');
const dropped = droppedTables(readFileSync(join(sqliteDir, 'migrations.ts'), 'utf8'), 88,
  ['closed-lists-migration.ts', 'waitlist-migration.ts'].map((file) => readFileSync(join(sqliteDir, file), 'utf8')));
const installed = device('shell', 'dumpsys', 'package', packageId);
if (!installed.includes(`versionCode=${apks.previous.versionCode} `) || !installed.includes(`versionName=${apks.previous.versionName}`)) {
  throw new Error('Prepare the filled synthetic rc.1 package before this stage');
}
function assertInstalled(name) {
  const apkPath = device('shell', 'pm', 'path', packageId).trim();
  if (!/^package:\/[^\n]+\.apk$/.test(apkPath)) throw new Error('Installed-upgrade requires one installed base APK');
  const hash = device('shell', 'sha256sum', apkPath.slice('package:'.length)).trim().split(/\s+/)[0];
  const metadata = device('shell', 'dumpsys', 'package', packageId);
  if (hash !== apks[name].sha256 || !metadata.includes(`versionCode=${apks[name].versionCode} `)
    || !metadata.includes(`versionName=${apks[name].versionName}`)) throw new Error(`Installed APK differs from ${name} input`);
}
assertInstalled('previous');
const root = resolve(process.env.ANDROID_TIER_LOG_DIR ?? join(repo, '.claude/android-tier'));
const evidenceDir = join(root, `installed-upgrade-${Date.now()}`);
mkdirSync(evidenceDir, { recursive: true });
const save = (name, value) => writeFileSync(join(evidenceDir, name), typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2));
save('inputs.json', { serial, avd, ...manifest, startedAt: start.startedAt, revision: start.revision });
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
let browser;
let forwarded = false;
async function connect() {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const pid = device('shell', 'pidof', packageId).trim();
      if (!/^\d+$/.test(pid)) throw new Error('No single app process');
      device('forward', `tcp:${port}`, `localabstract:webview_devtools_remote_${pid}`);
      forwarded = true;
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true, timeout: 3000 });
      const page = browser.contexts()[0]?.pages()[0];
      if (!page) throw new Error('No app WebView');
      page.setDefaultTimeout(60000);
      return page;
    } catch { if (browser) await browser.close(); browser = undefined; await pause(250); }
  }
  throw new Error('Installed-upgrade WebView did not become available');
}
async function launch() {
  device('shell', 'am', 'start', '-W', '-n', `${packageId}/dev.engender.app.disguise.LauncherDefault`);
  return connect();
}
async function unlock(page, failure = false) {
  await page.locator('[data-key="2"], [data-nav-item="home"], [data-rail-item="home"]').first().waitFor({ state: 'attached' });
  if (await page.locator('[data-key="2"]').count()) for (const digit of '2468') await page.locator(`[data-key="${digit}"]`).click();
  await page.locator(failure ? '[data-boot-failure]' : '[data-nav-item="home"], [data-rail-item="home"]').first().waitFor({ state: 'attached' });
}
async function snapshot(page) {
  const state = await page.evaluate(async () => {
    const session = `installed-upgrade-${crypto.randomUUID()}`;
    let seq = 0;
    const query = async (sql) => (await window.Capacitor.nativePromise('Sqlite', 'query', { session, seq: seq++, sql, params: [] })).rows;
    const counts = {};
    for (const { name } of await query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")) {
      counts[name] = (await query(`SELECT count(*) AS n FROM "${name.replaceAll('"', '""')}"`))[0].n;
    }
    return { userVersion: (await query('PRAGMA user_version'))[0].user_version, counts,
      entryUuids: (await query('SELECT uuid FROM entry ORDER BY uuid')).map((row) => row.uuid),
      linkedMilestones: (await query('SELECT count(*) AS n FROM photo WHERE milestone_id = (SELECT min(id) FROM milestone)'))[0].n,
      integrity: await query('PRAGMA integrity_check'), foreignKeys: await query('PRAGMA foreign_key_check') };
  });
  const hashes = device('shell', 'run-as', packageId, 'sh', '-c', "'cd files/photos && find . -type f -exec sha256sum {} \\;'");
  state.mediaSha256 = {};
  for (const line of hashes.trim().split('\n')) {
    const match = /^([a-f0-9]{64})\s+(.+)$/.exec(line.trim());
    if (!match) throw new Error('Invalid installed-upgrade media hash evidence');
    state.mediaSha256[match[2]] = match[1];
  }
  state.alarms = alarmState(device('shell', 'dumpsys', 'alarm'), packageId);
  return state;
}
const disconnect = async () => { if (browser) await browser.close(); browser = undefined; };
const install = (name) => {
  save(`${name}-install.log`, device('install', '-r', '-d', apks[name].path));
  assertInstalled(name);
};
let before;
let backup;
let result;
const completedChecks = [];
try {
  let page = await launch(); await unlock(page);
  before = await snapshot(page); assertFilledState(before); save('before.json', before);
  await disconnect(); device('shell', 'am', 'force-stop', packageId);
  backup = run(adb, ['-s', serial, 'exec-out', 'run-as', packageId, 'tar', '-cf', '-', 'databases', 'files', 'shared_prefs', 'app_webview'], { encoding: null });
  save('baseline-data.tar', backup);
  const reset = () => {
    install('previous'); device('shell', 'am', 'force-stop', packageId);
    device('shell', 'run-as', packageId, 'rm', '-rf', 'databases', 'files', 'shared_prefs', 'app_webview');
    assertDevice(); run(adb, ['-s', serial, 'shell', '-T', `run-as ${packageId} tar -xf -`], { input: backup, encoding: null });
  };
  for (const name of ['healthy', 'rowDeleting', 'failing']) {
    reset(); page = await launch(); await unlock(page);
    const restored = await snapshot(page); save(`${name}-baseline-reset.json`, restored); assertUpgradeState(before, restored, 88);
    await disconnect();
    install(name);
    let alarmDump = device('shell', 'dumpsys', 'alarm');
    if (name === 'healthy') {
      const deadline = Date.now() + 30000;
      while (JSON.stringify(alarmState(alarmDump, packageId)) !== JSON.stringify(before.alarms) && Date.now() < deadline) {
        await pause(250); alarmDump = device('shell', 'dumpsys', 'alarm');
      }
      if (JSON.stringify(alarmState(alarmDump, packageId)) !== JSON.stringify(before.alarms)) throw new Error('Healthy installed update did not preserve alarms before first open');
      completedChecks.push('healthy installed update preserves alarms before first open');
    }
    save(`${name}-alarms-before-open.log`, alarmDump);
    page = await launch(); await unlock(page, name === 'failing');
    if (name === 'failing') {
      await page.locator('[data-restore-previous]').waitFor({ state: 'visible' });
      save('failure-before-restore.png', await page.screenshot());
      const copyHash = device('shell', 'run-as', packageId, 'sha256sum', 'databases/engender.sqlite3.pre-migration-backup').trim().split(/\s+/)[0];
      if (!/^[a-f0-9]{64}$/.test(copyHash)) throw new Error('Failed migration did not retain the encrypted copy');
      await page.locator('[data-restore-previous]').click();
      await page.locator('[data-key="2"]').waitFor({ state: 'visible' });
      const restoredHash = device('shell', 'run-as', packageId, 'sha256sum', 'databases/engender.sqlite3').trim().split(/\s+/)[0];
      save('restored-database-hashes.json', { copyHash, restoredHash });
      if (copyHash !== restoredHash) throw new Error('Restoring the migration copy did not restore its bytes');
      // Credential adoption is one-way: the released binary cannot read the native wrap.
      await disconnect(); install('healthy'); page = await launch(); await unlock(page);
      const after = await snapshot(page); save('restored.json', after);
      save('restored-table.json', assertUpgradeState(before, after, manifest.expectedVersion, dropped));
      completedChecks.push('failed migration offers saved copy', 'saved copy restores filled rc.1 journal');
    } else {
      const after = await snapshot(page); save(`${name}-after.json`, after);
      const comparison = compareUpgradeState(before, after, manifest.expectedVersion, dropped); save(`${name}-table.json`, comparison);
      if (name === 'healthy') {
        assertUpgradeState(before, after, manifest.expectedVersion, dropped);
        completedChecks.push('healthy installed update preserves rows, media, integrity, foreign keys, schema and alarms');
      } else {
        if (!comparison.differences.includes('rows:side_effect') || after.counts.side_effect !== before.counts.side_effect - 1) {
          throw new Error('Row-deleting installed control did not fail the side-effect comparison');
        }
        completedChecks.push('row-deleting installed control rejected');
      }
    }
    await disconnect();
  }
  const api = Number(device('shell', 'getprop', 'ro.build.version.sdk').trim());
  const upgradeApks = Object.fromEntries(Object.entries(apks).map(([name, { path, ...identity }]) => [name, identity]));
  result = { avd, serial, api, nativeOnly: false, kind: 'installed-upgrade', completedStages: ['installed-upgrade'], completedChecks,
    build: { apkSha256: apks.healthy.sha256, upgradeApks, sourceStart: manifest.sourceStart }, evidenceDir };
  save('result.json', result);
} catch (error) {
  save('failure.log', error.stack ?? String(error)); throw error;
} finally {
  await disconnect();
  if (forwarded) device('forward', '--remove', `tcp:${port}`);
  // Restore the filled old test package, leaving no candidate or control installed.
  if (backup && before) {
    install('previous'); device('shell', 'am', 'force-stop', packageId);
    device('shell', 'run-as', packageId, 'rm', '-rf', 'databases', 'files', 'shared_prefs', 'app_webview');
    assertDevice(); run(adb, ['-s', serial, 'shell', '-T', `run-as ${packageId} tar -xf -`], { input: backup, encoding: null });
  }
}
writeAndroidTierEvidence(repo, start, [result]);
console.log(`PASS installed-upgrade: ${completedChecks.length} checks; evidence ${evidenceDir}`);
