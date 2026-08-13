import { mkdtempSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';

const ROOT = mkdtempSync(join(tmpdir(), 'gd-release-switch-'));
const SCRIPT = join(process.cwd(), 'scripts/journal-release.mjs');

function makeRelease(path: string, version: string, buildId: string, schemaMax: number) {
  mkdirSync(join(path, '_app'), { recursive: true });
  writeFileSync(join(path, 'index.html'), '<!doctype html>\n');
  writeFileSync(join(path, 'service-worker.js'), '// sw\n');
  writeFileSync(join(path, '_app/version.json'), `${JSON.stringify({ version: buildId })}\n`);
  writeFileSync(join(path, 'release.json'), `${JSON.stringify({ version, buildId, schemaMax }, null, 2)}\n`);
}

function run(args: string[], cwd: string) {
  return spawnSync('node', [SCRIPT, ...args], { cwd, encoding: 'utf8' });
}

describe('journal-release deploy and rollback', () => {
  test('deploy publishes complete release directories and switches current to the newest one', () => {
    const root = join(ROOT, 'deploy-one', 'releases');
    const current = join(ROOT, 'deploy-one', 'current');
    const srcOne = join(ROOT, 'deploy-one', 'upload-one');
    const srcTwo = join(ROOT, 'deploy-one', 'upload-two');

    mkdirSync(srcOne, { recursive: true });
    mkdirSync(srcTwo, { recursive: true });
    makeRelease(srcOne, '1.2.3', 'build-a', 2);
    makeRelease(srcTwo, '1.2.4', 'build-b', 3);

    const first = run(['deploy', srcOne, '--root', root, '--current', current], ROOT);
    expect(first.status).toBe(0);
    expect(readlinkSync(current)).toContain('1.2.3--build-a');

    const second = run(['deploy', srcTwo, '--root', root, '--current', current], ROOT);
    expect(second.status).toBe(0);
    expect(readlinkSync(current)).toContain('1.2.4--build-b');

    const kept = readFileSync(join(root, '1.2.3--build-a', 'release.json'), 'utf8');
    expect(kept).toContain('"schemaMax": 2');
  });

  test('rollback refuses a target whose schemaMax is older than the current one', () => {
    const root = join(ROOT, 'guard', 'releases');
    const current = join(ROOT, 'guard', 'current');
    const old = join(root, '1.0.0--old');
    const newer = join(root, '1.1.0--newer');

    mkdirSync(old, { recursive: true });
    mkdirSync(newer, { recursive: true });
    makeRelease(old, '1.0.0', 'old', 2);
    makeRelease(newer, '1.1.0', 'newer', 3);
    symlinkSync(newer, current);

    const result = run(['rollback', '1.0.0--old', '--root', root, '--current', current], ROOT);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing rollback');
  });

  test('rollback --previous switches to the last compatible release', () => {
    const root = join(ROOT, 'previous', 'releases');
    const current = join(ROOT, 'previous', 'current');
    const first = join(root, '2.0.0--a');
    const second = join(root, '2.0.1--b');

    mkdirSync(first, { recursive: true });
    mkdirSync(second, { recursive: true });
    makeRelease(first, '2.0.0', 'a', 4);
    makeRelease(second, '2.0.1', 'b', 4);
    symlinkSync(second, current);

    const result = run(['rollback', '--previous', '--root', root, '--current', current], ROOT);
    expect(result.status).toBe(0);
    expect(readlinkSync(current)).toContain('2.0.0--a');
  });

  test('deploy refuses a development version by default', () => {
    const root = join(ROOT, 'dev-guard', 'releases');
    const current = join(ROOT, 'dev-guard', 'current');
    const source = join(ROOT, 'dev-guard', 'upload');

    mkdirSync(source, { recursive: true });
    makeRelease(source, '0.0.0-dev+gabcd1234.dirty', 'build-dev', 3);

    const result = run(['deploy', source, '--root', root, '--current', current], ROOT);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing to deploy development version');
  });

  test('deploy allows a development version only with an explicit override', () => {
    const root = join(ROOT, 'dev-override', 'releases');
    const current = join(ROOT, 'dev-override', 'current');
    const source = join(ROOT, 'dev-override', 'upload');

    mkdirSync(source, { recursive: true });
    makeRelease(source, '0.0.0-dev+gabcd1234.dirty', 'build-dev', 3);

    const result = run(
      ['deploy', source, '--root', root, '--current', current, '--allow-development-version'],
      ROOT
    );
    expect(result.status).toBe(0);
    expect(readlinkSync(current)).toContain('0.0.0-dev_gabcd1234.dirty--build-dev');
  });
});
