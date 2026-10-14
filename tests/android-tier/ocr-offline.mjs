/* Real first-use OCR on an owned emulator, with no app online warm-up. */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { offlineOcrStage } from './offline-ocr-stage.mjs';
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
let emulator;
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
  await offlineOcrStage({ device: (args, options = {}) => spawnSync(adbBin, ['-s', serial, ...args],
    { encoding: 'utf8', timeout: 20000, ...options }), pkg, avd, evidenceDir: out,
    apk: process.env.OCR_OFFLINE_APK, testApk: process.env.OCR_OFFLINE_TEST_APK });
} finally {
  if (emulator) {
    await stopOwnedEmulator(emulator, avd, query);
  }
}
