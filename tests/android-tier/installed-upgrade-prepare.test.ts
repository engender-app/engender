import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

const command = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ execFileSync: command }));
const originalArgv = process.argv;
let directory: string;
afterEach(() => {
  process.argv = originalArgv;
  vi.unstubAllEnvs();
  vi.resetModules();
  command.mockReset();
  if (directory) rmSync(directory, { recursive: true, force: true });
});

it('refuses retained uninstalled package data before installing the released fixture', async () => {
  directory = mkdtempSync(join(tmpdir(), 'upgrade-prepare-'));
  mkdirSync(join(directory, 'build-tools', '35.0.0'), { recursive: true });
  vi.stubEnv('ANDROID_HOME', directory);
  const packageId = 'dev.engender.app.test.upgrade40';
  const sha256 = createHash('sha256').update('fixture').digest('hex');
  writeFileSync(join(directory, 'previous.apk'), 'fixture');
  writeFileSync(join(directory, 'fixture.engender'), 'fixture');
  writeFileSync(join(directory, 'fixture.json'), JSON.stringify({ userVersion: 88, sourceRevision: 'released', sha256 }));
  const manifest = join(directory, 'manifest.json');
  writeFileSync(manifest, JSON.stringify({ fixture: 'fixture.engender', upgradeApks: {
    previous: { path: 'previous.apk', packageId, sha256, versionCode: 1000000501, sourceRevision: 'released' }
  } }));
  process.argv = ['node', 'installed-upgrade-prepare.mjs', 'emulator-5590', 'upgrade40', manifest];
  command.mockImplementation((executable: string, args: string[]) => {
    if (executable.endsWith('/aapt')) return `package: name='${packageId}' versionCode='1000000501' versionName='1.0.0-rc.1'`;
    if (args.join(' ') === 'forward --list') return '';
    if (args.includes('emu')) return 'upgrade40\nOK';
    if (args.includes('packages')) return args.includes('-u') ? `package:${packageId}\n` : '';
    throw new Error(`Unexpected device command: ${args.join(' ')}`);
  });
  await expect(import('./installed-upgrade-prepare.mjs')).rejects.toThrow('Synthetic upgrade package already exists');
  expect(command.mock.calls.some(([, args]) => args.includes('install'))).toBe(false);
});
