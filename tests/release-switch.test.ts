import { cpSync, mkdtempSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import legacyOcr from '../src/lib/pwa/legacy-ocr-assets.json';
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
  test.each([
    ['3.0.0', 2, 'schemaMax'],
    ['1.9.9', 3, 'over newer']
  ])('refuses unsafe or stale deployment %s without switching current', (version, schemaMax, reason) => {
    const root = join(ROOT, `stale-${version}`, 'releases');
    const current = join(ROOT, `stale-${version}`, 'current');
    const active = join(root, '2.0.0--active');
    const source = join(ROOT, `stale-${version}`, 'upload');
    makeRelease(active, '2.0.0', 'active', 3);
    makeRelease(source, String(version), 'candidate', Number(schemaMax));
    symlinkSync(active, current);

    const result = run(['deploy', source, '--root', root, '--current', current], ROOT);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(reason);
    expect(readlinkSync(current)).toBe(active);
  });

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

  test('keeps exact OCR generations and legacy root bytes across switches', () => {
    const directory = join(ROOT, 'ocr');
    const root = join(directory, 'releases');
    const current = join(directory, 'current');
    const old = join(directory, 'old');
    const next = join(directory, 'next');
    makeRelease(old, '2.0.0', 'a', 88);
    makeRelease(next, '2.0.1', 'b', 88);
    mkdirSync(join(next, 'tesseract'), { recursive: true });
    writeFileSync(join(next, 'tesseract/assets.json'), JSON.stringify({ legacyRuntime: legacyOcr }));
    const legacyPath = join(old, legacyOcr[0].path);
    mkdirSync(join(legacyPath, '..'), { recursive: true });
    writeFileSync(legacyPath, gunzipSync(readFileSync('tests/fixtures/ocr/pre21-tesseract.js.gz')));
    const a = 'a'.repeat(64), b = 'b'.repeat(64);
    for (const [path, payload] of [[join(old, 'tesseract', a, 'worker.min.js'), 'old generation'],
      [join(old, 'tesseract/lang-data/eng.traineddata.gz'), 'old compressed model'],
      [join(next, 'tesseract', b, 'worker.min.js'), 'new generation'],
      [join(next, 'tesseract/lang-data/eng.traineddata'), 'new model']]) {
      mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, payload);
    }
    expect(run(['deploy', old, '--root', root, '--current', current], ROOT).status).toBe(0);
    expect(run(['deploy', next, '--root', root, '--current', current], ROOT).status).toBe(0);
    const deployed = readlinkSync(current);
    expect(readFileSync(join(deployed, legacyOcr[0].path))).toEqual(readFileSync(legacyPath));
    expect(readFileSync(join(deployed, 'tesseract', a, 'worker.min.js'), 'utf8')).toBe('old generation');
    expect(readFileSync(join(deployed, 'tesseract', b, 'worker.min.js'), 'utf8')).toBe('new generation');
    expect(readFileSync(join(deployed, 'tesseract/lang-data/eng.traineddata'), 'utf8')).toBe('old compressed model');
  });

  test('refuses an OCR identity collision before switching current', () => {
    const directory = join(ROOT, 'ocr-collision');
    const root = join(directory, 'releases'), current = join(directory, 'current');
    const old = join(directory, 'old'), next = join(directory, 'next');
    makeRelease(old, '2.0.0', 'a', 88); makeRelease(next, '2.0.1', 'b', 88);
    for (const [path, payload] of [[old, 'original'], [next, 'changed']]) {
      const target = join(path, 'tesseract', 'a'.repeat(64), 'worker.min.js');
      mkdirSync(join(target, '..'), { recursive: true }); writeFileSync(target, payload);
    }
    expect(run(['deploy', old, '--root', root, '--current', current], ROOT).status).toBe(0);
    const previous = readlinkSync(current);
    const result = run(['deploy', next, '--root', root, '--current', current], ROOT);
    expect(result.status).toBe(1); expect(result.stderr).toContain('OCR generation collision');
    expect(readlinkSync(current)).toBe(previous);
  });

  test('reads the legacy receipt from the upload with standalone operator scripts', () => {
    const directory = join(ROOT, 'ocr-standalone');
    const operator = join(directory, 'operator');
    mkdirSync(operator, { recursive: true });
    cpSync(SCRIPT, join(operator, 'journal-release.mjs'));
    cpSync(join(process.cwd(), 'scripts/app-version.mjs'), join(operator, 'app-version.mjs'));
    const root = join(directory, 'releases'), current = join(directory, 'current');
    const old = join(directory, 'old'), next = join(directory, 'next');
    makeRelease(old, '2.0.0', 'a', 88); makeRelease(next, '2.0.1', 'b', 88);
    const source = join(old, legacyOcr[0].path);
    mkdirSync(join(source, '..'), { recursive: true });
    writeFileSync(source, gunzipSync(readFileSync('tests/fixtures/ocr/pre21-tesseract.js.gz')));
    mkdirSync(join(next, 'tesseract'), { recursive: true });
    writeFileSync(join(next, 'tesseract/assets.json'), JSON.stringify({ legacyRuntime: legacyOcr }));
    const deploy = (path: string) => spawnSync('node', [join(operator, 'journal-release.mjs'),
      'deploy', path, '--root', root, '--current', current], { encoding: 'utf8' });
    expect(deploy(old).status).toBe(0); expect(deploy(next).status).toBe(0);
    expect(readFileSync(join(readlinkSync(current), legacyOcr[0].path))).toEqual(readFileSync(source));
  });

  test('refuses a legacy metadata path outside public chunks', () => {
    const directory = join(ROOT, 'ocr-path');
    const root = join(directory, 'releases'), current = join(directory, 'current');
    const old = join(directory, 'old'), next = join(directory, 'next');
    makeRelease(old, '2.0.0', 'a', 88); makeRelease(next, '2.0.1', 'b', 88);
    mkdirSync(join(next, 'tesseract'), { recursive: true });
    writeFileSync(join(next, 'tesseract/assets.json'), JSON.stringify({ legacyRuntime: [{
      path: '/../private.js', sha256: 'a'.repeat(64) }] }));
    expect(run(['deploy', old, '--root', root, '--current', current], ROOT).status).toBe(0);
    const previous = readlinkSync(current);
    const result = run(['deploy', next, '--root', root, '--current', current], ROOT);
    expect(result.status).toBe(1); expect(result.stderr).toContain('Invalid legacy OCR identity');
    expect(readlinkSync(current)).toBe(previous);
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
