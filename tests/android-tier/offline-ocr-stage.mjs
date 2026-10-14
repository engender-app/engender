import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { reportStage } from './instrumentation.mjs';

/** @typedef {{status: number | null, signal: string | null, error?: Error, stdout: string, stderr?: string}} DeviceResult */
/**
 * Runs fresh installed OCR on the caller's owned runtime and restores its network state.
 * @param {{device: (args: string[], options?: {timeout?: number}) => DeviceResult,
 * pkg: string, apk: string, testApk: string, evidenceDir: string, avd: string}} options
 */
export async function offlineOcrStage({ device, pkg, apk, testApk, evidenceDir, avd }) {
  if (!/^dev\.engender\.app\.test\.[a-z0-9]+$/.test(pkg)) throw new Error('offline OCR requires an isolated package');
  /** @param {string[]} args @param {number} [timeout] */
  const command = (args, timeout = 20000) => {
    const result = device(args, { timeout });
    if (result.status !== 0 || result.signal || result.error) throw new Error(`offline OCR command failed: ${args.join(' ')}`);
    return result.stdout.trim();
  };
  const airplane = command(['shell', 'settings', 'get', 'global', 'airplane_mode_on']);
  const wifi = command(['shell', 'settings', 'get', 'global', 'wifi_on']);
  try {
    command(['shell', 'cmd', 'connectivity', 'airplane-mode', 'enable']);
    command(['shell', 'svc', 'wifi', 'disable']);
    command(['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']);
    command(['shell', 'wm', 'dismiss-keyguard']);
    device(['uninstall', pkg]);
    device(['uninstall', `${pkg}.test`]);
    for (const file of [apk, testApk]) {
      if (!command(['install', '-t', file], 120000).includes('Success')) throw new Error('offline OCR fresh installation failed');
    }
    let network;
    const deadline = Date.now() + 15000;
    do {
      command(['shell', 'svc', 'wifi', 'disable']);
      network = {
        airplane: command(['shell', 'settings', 'get', 'global', 'airplane_mode_on']),
        wifiStatus: command(['shell', 'cmd', 'wifi', 'status'])
      };
      if (network.airplane === '1' && network.wifiStatus.includes('Wifi is disabled')) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    } while (Date.now() < deadline);
    if (network.airplane !== '1' || !network.wifiStatus.includes('Wifi is disabled')) throw new Error('offline OCR network state missing');
    command(['logcat', '-c']);
    const output = command(['shell', 'am', 'instrument', '-w', '-r', '-e', 'class',
      'dev.engender.app.ocr.OcrOfflineRecognitionTest#freshEnglishAndPolishScansWorkInAirplaneMode',
      `${pkg}.test/androidx.test.runner.AndroidJUnitRunner`], 240000);
    writeFileSync(join(evidenceDir, `${avd}-ocr-instrumentation.log`), output);
    const nativeLog = command(['logcat', '-d', '-s', 'System.out:I', '-v', 'raw']);
    const line = [...output.split('\n'), ...nativeLog.split('\n')].findLast(line => line.startsWith('Offline OCR evidence: '));
    const evidence = line ? JSON.parse(line.slice('Offline OCR evidence: '.length)) : null;
    writeFileSync(join(evidenceDir, `${avd}-ocr-result.json`), JSON.stringify({ pkg, network,
      freshInstallation: true, onlineWarmup: false, evidence }, null, 2));
    const completed = reportStage('offline OCR', { status: 0, stdout: output }, { ok: () => {}, fail: () => {} });
    if (!completed || !evidence?.passed || evidence.scans?.length !== 2) throw new Error('real offline OCR recognition failed');
  } finally {
    device(['shell', 'am', 'force-stop', pkg]);
    const cleanup = { app: device(['uninstall', pkg]), instrumentation: device(['uninstall', `${pkg}.test`]),
      airplane: device(['shell', 'cmd', 'connectivity', 'airplane-mode', airplane === '1' ? 'enable' : 'disable']),
      wifi: device(['shell', 'svc', 'wifi', ['1', '3'].includes(wifi) ? 'enable' : 'disable']) };
    writeFileSync(join(evidenceDir, `${avd}-ocr-cleanup.json`), JSON.stringify(cleanup, null, 2));
    if (Object.values(cleanup).some(result => result.status !== 0 || result.signal || result.error)
        || !cleanup.app.stdout.includes('Success') || !cleanup.instrumentation.stdout.includes('Success')) {
      throw new Error('offline OCR cleanup failed');
    }
  }
}
