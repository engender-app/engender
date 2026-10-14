import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { offlineOcrStage } from './offline-ocr-stage.mjs';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const complete = 'INSTRUMENTATION_STATUS: current=1\nINSTRUMENTATION_STATUS: numtests=1\nINSTRUMENTATION_STATUS_CODE: 1\nINSTRUMENTATION_STATUS: current=1\nINSTRUMENTATION_STATUS: numtests=1\nINSTRUMENTATION_STATUS_CODE: 0\nOK (1 test)\nINSTRUMENTATION_CODE: -1';

function fixture(passed: boolean, instrumentation = passed ? complete : 'FAILURES!!!') {
  const evidenceDir = mkdtempSync(join(tmpdir(), 'offline-ocr-stage-'));
  roots.push(evidenceDir);
  const calls: string[][] = [];
  const device = (args: string[]) => {
    calls.push(args);
    let stdout = args[0] === 'install' || args[0] === 'uninstall' ? 'Success' : '';
    if (args.join(' ').includes('settings get global airplane_mode_on')) stdout = calls.some(call => call.includes('enable')) ? '1' : '0';
    if (args.join(' ').includes('settings get global wifi_on')) stdout = '1';
    if (args.join(' ').includes('cmd wifi status')) stdout = 'Wifi is disabled';
    if (args.includes('instrument')) stdout = instrumentation;
    if (args.includes('System.out:I')) stdout = `Offline OCR evidence: ${JSON.stringify({ passed, scans: [{}, {}] })}`;
    return { status: 0, signal: null, stdout, stderr: '' };
  };
  return { options: { device, pkg: 'dev.engender.app.test.offlineocr', apk: 'app.apk', testApk: 'test.apk', evidenceDir, avd: 'owned' }, calls };
}

it('uses fresh isolated installs after disabling networks and restores settings', async () => {
  const { options, calls } = fixture(true);
  await offlineOcrStage(options);
  const firstInstall = calls.findIndex(args => args[0] === 'install');
  expect(calls.slice(0, firstInstall)).toContainEqual(['shell', 'svc', 'wifi', 'disable']);
  expect(calls.slice(0, firstInstall)).toContainEqual(['uninstall', options.pkg]);
  expect(calls.slice(0, firstInstall)).toContainEqual(['uninstall', `${options.pkg}.test`]);
  expect(calls.slice(0, firstInstall)).toContainEqual(['shell', 'pm', 'list', 'packages', '-u']);
  expect(JSON.parse(readFileSync(join(options.evidenceDir, 'owned-ocr-preinstall.json'), 'utf8'))).toEqual({
    checkedPackages: [options.pkg, `${options.pkg}.test`], remaining: []
  });
  expect(calls.filter(args => args.includes('instrument'))).toHaveLength(1);
  expect(calls).toContainEqual(['shell', 'cmd', 'connectivity', 'airplane-mode', 'disable']);
  expect(calls.at(-1)).toEqual(['shell', 'svc', 'wifi', 'enable']);
  expect(JSON.parse(readFileSync(join(options.evidenceDir, 'owned-ocr-result.json'), 'utf8'))).toMatchObject({ freshInstallation: true, onlineWarmup: false });
});

for (const output of ['OK (1 test)', 'OK (1 test)\nINSTRUMENTATION_FAILED: process crashed', `${complete}\nINSTRUMENTATION_ABORTED: crash`]) {
  it(`refuses incomplete or crashed instrumentation despite recognition evidence: ${output}`, async () => {
    const { options, calls } = fixture(true, output);
    await expect(offlineOcrStage(options)).rejects.toThrow('real offline OCR recognition failed');
    expect(calls.slice(-4, -2)).toEqual([['uninstall', options.pkg], ['uninstall', `${options.pkg}.test`]]);
    expect(calls.at(-1)).toEqual(['shell', 'svc', 'wifi', 'enable']);
  });
}

it('refuses failed recognition and still uninstalls both packages and restores settings', async () => {
  const { options, calls } = fixture(false);
  await expect(offlineOcrStage(options)).rejects.toThrow('real offline OCR recognition failed');
  expect(calls.slice(-4, -2)).toEqual([['uninstall', options.pkg], ['uninstall', `${options.pkg}.test`]]);
  expect(calls.at(-1)).toEqual(['shell', 'svc', 'wifi', 'enable']);
});

for (const suffix of ['', '.test']) {
  it(`refuses a retained ${suffix ? 'instrumentation' : 'app'} package after failed uninstall`, async () => {
    const { options, calls } = fixture(true);
    const leftover = `${options.pkg}${suffix}`;
    const original = options.device;
    options.device = (args) => {
      const result = original(args);
      if (args[0] === 'uninstall' && args[1] === leftover &&
          calls.filter(call => call[0] === 'uninstall' && call[1] === leftover).length === 1) {
        return { ...result, status: 1, stdout: 'Failure [DELETE_FAILED_INTERNAL_ERROR]' };
      }
      if (args.join(' ') === 'shell pm list packages -u') return { ...result, stdout: `package:${leftover}\n` };
      return result;
    };
    await expect(offlineOcrStage(options)).rejects.toThrow('offline OCR packages remain before fresh installation');
    expect(calls.some(args => args[0] === 'install' || args.includes('instrument'))).toBe(false);
    expect(existsSync(join(options.evidenceDir, 'owned-ocr-result.json'))).toBe(false);
    expect(calls.at(-1)).toEqual(['shell', 'svc', 'wifi', 'enable']);
  });
}

it('refuses an unreadable package inventory before installation', async () => {
  const { options, calls } = fixture(true);
  const original = options.device;
  options.device = (args) => {
    const result = original(args);
    return args.join(' ') === 'shell pm list packages -u' ? { ...result, status: 1 } : result;
  };
  await expect(offlineOcrStage(options)).rejects.toThrow('offline OCR command failed: shell pm list packages -u');
  expect(calls.some(args => args[0] === 'install' || args.includes('instrument'))).toBe(false);
  expect(existsSync(join(options.evidenceDir, 'owned-ocr-result.json'))).toBe(false);
  expect(calls.at(-1)).toEqual(['shell', 'svc', 'wifi', 'enable']);
});

it('refuses nonisolated packages before any device action', async () => {
  const { options, calls } = fixture(true);
  await expect(offlineOcrStage({ ...options, pkg: 'dev.engender.app' })).rejects.toThrow('isolated package');
  expect(calls).toEqual([]);
});
