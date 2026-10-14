/* Real first-use OCR on an owned emulator, with no app online warm-up. */
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startOwnedEmulator, stopOwnedEmulator } from './emulator.mjs';

const avd = process.env.OCR_OFFLINE_AVD;
const pkg = process.env.OCR_OFFLINE_PACKAGE;
if (!avd || !/^(last-audit-backend-|ocr-offline-)[a-z0-9-]+$/.test(avd)) throw new Error('supply an owned OCR AVD');
if (!pkg || !/^dev\.engender\.app\.test\.[a-z0-9]+$/.test(pkg)) throw new Error('supply an isolated OCR test package');
if (!process.env.OCR_OFFLINE_APK || !process.env.OCR_OFFLINE_TEST_APK) throw new Error('supply app and instrumentation APKs');
if (!/Max core file size\s+0\s+/.test(readFileSync('/proc/self/limits', 'utf8'))) throw new Error('set ulimit -c 0 before QEMU');
const port = Number(process.env.OCR_OFFLINE_PORT ?? 5566);
if (!Number.isInteger(port) || port < 5554 || port > 5682 || port % 2) throw new Error('invalid owned emulator port');
const serial = `emulator-${port}`;
const sdk = process.env.ANDROID_HOME ?? join(process.env.HOME, 'Android/Sdk');
const adbBin = join(sdk, 'platform-tools/adb');
const out = process.env.OCR_OFFLINE_OUTPUT ?? 'ci-logs/ocr-offline';
mkdirSync(out, { recursive: true });
const query = args => spawnSync(adbBin, ['-s', serial, ...args], { encoding: 'utf8', timeout: 10000 });
const adb = (...args) => execFileSync(adbBin, ['-s', serial, ...args], { encoding: 'utf8', timeout: 20000 });
const attempt = (...args) => { try { return adb(...args).trim(); } catch { return ''; } };
let emulator;
let airplane;
let wifi;
try {
  const log = openSync(join(out, 'emulator.log'), 'a');
  try {
    emulator = await startOwnedEmulator({ name: avd, query, timeout: 240000, launch: () => {
      const child = spawn(join(sdk, 'emulator/emulator'), ['-avd', avd, '-port', String(port),
        '-gpu', 'host', '-no-snapshot', '-no-audio', '-no-boot-anim'], { stdio: ['ignore', log, log] });
      writeFileSync(join(out, 'resources.json'), JSON.stringify({ pid: child.pid, avd, serial, pkg }));
      return child;
    } });
  } finally { closeSync(log); }
  airplane = adb('shell', 'settings', 'get', 'global', 'airplane_mode_on').trim();
  wifi = adb('shell', 'settings', 'get', 'global', 'wifi_on').trim();
  adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'enable');
  adb('shell', 'svc', 'wifi', 'disable');
  adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
  adb('shell', 'wm', 'dismiss-keyguard');
  // A prior test installation cannot supply a traineddata or WebView cache.
  attempt('uninstall', pkg); attempt('uninstall', `${pkg}.test`);
  adb('install', '-t', process.env.OCR_OFFLINE_APK);
  adb('install', '-t', process.env.OCR_OFFLINE_TEST_APK);
  const network = {
    airplane: adb('shell', 'settings', 'get', 'global', 'airplane_mode_on').trim(),
    wifi: adb('shell', 'settings', 'get', 'global', 'wifi_on').trim(),
    wifiStatus: adb('shell', 'cmd', 'wifi', 'status').trim()
  };
  if (network.airplane !== '1' || !network.wifiStatus.includes('Wifi is disabled')) {
    throw new Error(`offline state missing: ${JSON.stringify(network)}`);
  }
  const output = execFileSync(adbBin, ['-s', serial, 'shell', 'am', 'instrument', '-w', '-e', 'class',
    'dev.engender.app.ocr.OcrOfflineRecognitionTest#freshEnglishAndPolishScansWorkInAirplaneMode',
    `${pkg}.test/androidx.test.runner.AndroidJUnitRunner`], { encoding: 'utf8', timeout: 240000 });
  writeFileSync(join(out, 'instrumentation.log'), output);
  const nativeLog = adb('logcat', '-d', '-s', 'System.out:I', '-v', 'raw');
  const line = [...output.split('\n'), ...nativeLog.split('\n')]
    .findLast(line => line.startsWith('Offline OCR evidence: '));
  const evidence = line ? JSON.parse(line.slice('Offline OCR evidence: '.length)) : null;
  writeFileSync(join(out, 'result.json'), JSON.stringify({ avd, serial, pkg, network, freshInstallation: true,
    onlineWarmup: false, evidence, passed: output.includes('OK (1 test)') }, null, 2));
  console.log(output);
  if (!output.includes('OK (1 test)')) throw new Error('real offline OCR recognition failed');
  if (!evidence?.passed || evidence.scans?.length !== 2) throw new Error('offline OCR evidence missing');
} finally {
  if (emulator) {
    attempt('shell', 'am', 'force-stop', pkg);
    const cleanup = { app: attempt('uninstall', pkg), instrumentation: attempt('uninstall', `${pkg}.test`) };
    if (airplane !== undefined) attempt('shell', 'cmd', 'connectivity', 'airplane-mode', airplane === '1' ? 'enable' : 'disable');
    if (wifi !== undefined) attempt('shell', 'svc', 'wifi', ['1', '3'].includes(wifi) ? 'enable' : 'disable');
    writeFileSync(join(out, 'cleanup.json'), JSON.stringify(cleanup));
    await stopOwnedEmulator(emulator, avd, query);
  }
}
