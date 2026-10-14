import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import legacyOcr from '../src/lib/pwa/legacy-ocr-assets.json';
import { afterAll, describe, expect, test } from 'vitest';

const ROOT = mkdtempSync(join(tmpdir(), 'gd-release-switch-'));
const SCRIPT = join(process.cwd(), 'scripts/journal-release.mjs');
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

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
  test('previous follows active history after rollback and another deploy, regardless of mtimes', () => {
    const directory = join(ROOT, 'active-history');
    const root = join(directory, 'releases'), current = join(directory, 'current');
    const sources = ['one', 'two', 'three'].map((id, index) => {
      const source = join(directory, id);
      makeRelease(source, `1.0.${index}`, id, 90);
      return source;
    });
    const command = (...args: string[]) => run([...args, '--root', root, '--current', current], ROOT);
    expect(command('deploy', sources[0]).status).toBe(0);
    const first = readlinkSync(current);
    expect(command('deploy', sources[1]).status).toBe(0);
    const pulled = readlinkSync(current);
    expect(command('rollback', '1.0.0--one').status).toBe(0);
    const deployment = command('deploy', sources[2]);
    expect(deployment.status).toBe(0);
    expect(deployment.stdout).toContain(`Previous kept at ${first}`);
    utimesSync(first, new Date('2020-01-01'), new Date('2020-01-01'));
    utimesSync(pulled, new Date('2030-01-01'), new Date('2030-01-01'));
    const listed = command('list');
    expect(listed.status).toBe(0);
    expect(listed.stdout).toContain('< 1.0.0--one');
    expect(listed.stdout).not.toContain('< 1.0.1--two');

    const rollback = command('rollback', '--previous');
    expect(rollback.status).toBe(0);
    expect(readlinkSync(current)).toBe(first);
    expect(command('list').stdout).toContain('* 1.0.0--one');
    expect(command('list').stdout).toContain('< 1.0.2--three');
    expect(command('rollback', '--previous').status).toBe(0);
    expect(readlinkSync(current)).toContain('1.0.2--three');
  });

  test.each(['history-stage', 'history-publish', 'pdf-publish', 'current-rename'])(
    'restores history and the active PDF namespace after %s fails', (point) => {
      const directory = join(ROOT, `history-failure-${point}`);
      const root = join(directory, 'releases'), current = join(directory, 'current');
      const sources = ['a', 'b', 'c'].map((id, index) => {
        const source = join(directory, id);
        makeRelease(source, `2.0.${index}`, id, 90);
        mkdirSync(join(source, '_app/immutable/workers'), { recursive: true });
        writeFileSync(join(source, `_app/immutable/workers/pdf-worker-${id}.js`), `PDF ${id}`);
        return source;
      });
      const args = ['--root', root, '--current', current];
      for (const source of sources.slice(0, 2)) expect(run(['deploy', source, ...args], ROOT).status).toBe(0);
      const selected = readlinkSync(current), history = `${current}.history.json`;
      const priorHistory = readFileSync(history), priorPdf = readlinkSync(join(root, '.pdf-current'));
      const originalMetadata = readFileSync(join(selected, 'release.json'));
      const fault = join(directory, 'fault.mjs');
      writeFileSync(fault, `
        import fs from 'node:fs';
        import { syncBuiltinESMExports } from 'node:module';
        let injected = false;
        const fail = () => { injected = true; throw new Error('injected ${point} failure'); };
        const write = fs.writeFileSync;
        fs.writeFileSync = (path, ...args) => {
          const result = write(path, ...args);
          if (!injected && ${JSON.stringify(point)} === 'history-stage'
            && String(path).startsWith(${JSON.stringify(history + '.next-')})) fail();
          return result;
        };
        const rename = fs.renameSync;
        fs.renameSync = (from, to) => {
          const target = ${JSON.stringify(point)} === 'history-publish' ? ${JSON.stringify(history)}
            : ${JSON.stringify(point)} === 'pdf-publish' ? ${JSON.stringify(join(root, '.pdf-current'))}
            : ${JSON.stringify(current)};
          if (!injected && ${JSON.stringify(point)} !== 'history-stage' && to === target) fail();
          return rename(from, to);
        };
        syncBuiltinESMExports();
      `);
      const result = spawnSync('node', ['--import', fault, SCRIPT, 'deploy', sources[2], ...args], {
        cwd: ROOT, encoding: 'utf8'
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`injected ${point} failure`);
      expect(readlinkSync(current)).toBe(selected);
      expect(readFileSync(history)).toEqual(priorHistory);
      expect(readlinkSync(join(root, '.pdf-current'))).toBe(priorPdf);
      expect(readdirSync(join(root, '.pdf-current')).sort()).toEqual(['pdf-worker-a.js', 'pdf-worker-b.js']);
      expect(readdirSync(join(root, '.pdf-workers'))).toHaveLength(1);
      expect(readdirSync(directory).some(name => name.includes('.next-'))).toBe(false);
      expect(readdirSync(root).some(name => name.startsWith('.staging-'))).toBe(false);
      expect(readFileSync(join(selected, 'release.json'))).toEqual(originalMetadata);
      expect(run(['rollback', '--previous', ...args], ROOT).status).toBe(0);
      expect(readlinkSync(current)).toContain('2.0.0--a');
    }
  );

  test('legacy roots require a named rollback to establish active history', () => {
    const directory = join(ROOT, 'legacy-history');
    const root = join(directory, 'releases'), current = join(directory, 'current');
    const a = join(root, '2.0.0--a'), b = join(root, '2.0.1--b');
    makeRelease(a, '2.0.0', 'a', 90); makeRelease(b, '2.0.1', 'b', 90);
    symlinkSync(b, current);
    const args = ['--root', root, '--current', current];
    const refused = run(['rollback', '--previous', ...args], ROOT);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('No recorded previous release');
    expect(readlinkSync(current)).toBe(b);
    expect(run(['list', ...args], ROOT).stdout).not.toContain('< ');
    expect(run(['rollback', '2.0.0--a', ...args], ROOT).status).toBe(0);
    expect(run(['rollback', '--previous', ...args], ROOT).status).toBe(0);
    expect(readlinkSync(current)).toBe(b);
  });

  test.each(['stale', 'malformed', 'removed'])('refuses %s history without guessing another release', (state) => {
    const directory = join(ROOT, `invalid-history-${state}`);
    const root = join(directory, 'releases'), current = join(directory, 'current');
    const args = ['--root', root, '--current', current];
    for (const [index, id] of ['a', 'b'].entries()) {
      const source = join(directory, id);
      makeRelease(source, `2.0.${index}`, id, 90);
      expect(run(['deploy', source, ...args], ROOT).status).toBe(0);
    }
    if (state === 'stale') {
      const c = join(root, '2.0.2--c');
      makeRelease(c, '2.0.2', 'c', 90);
      rmSync(current); symlinkSync(c, current);
    } else if (state === 'malformed') writeFileSync(`${current}.history.json`, '{bad json');
    else rmSync(join(root, '2.0.0--a'), { recursive: true });
    const before = readlinkSync(current);
    const result = run(['rollback', '--previous', ...args], ROOT);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('No recorded previous release');
    expect(readlinkSync(current)).toBe(before);
    expect(run(['list', ...args], ROOT).stdout).not.toContain('< ');
  });

  test('a named rollback to current preserves its history and retained PDF namespace', () => {
    const directory = join(ROOT, 'already-current');
    const root = join(directory, 'releases'), current = join(directory, 'custom-current');
    const args = ['--root', root, '--current', current];
    for (const [index, id] of ['a', 'b'].entries()) {
      const source = join(directory, id);
      makeRelease(source, `2.0.${index}`, id, 90);
      expect(run(['deploy', source, ...args], ROOT).status).toBe(0);
    }
    const history = readFileSync(`${current}.history.json`), pdf = readlinkSync(join(root, '.pdf-current'));
    expect(run(['rollback', '2.0.1--b', ...args], ROOT).status).toBe(0);
    expect(readFileSync(`${current}.history.json`)).toEqual(history);
    expect(readlinkSync(join(root, '.pdf-current'))).toBe(pdf);
    expect(run(['list', ...args], ROOT).stdout).toContain('< 2.0.0--a');
  });

  test('a recorded previous release still needs the existing schema override', () => {
    const directory = join(ROOT, 'history-schema');
    const root = join(directory, 'releases'), current = join(directory, 'current');
    const args = ['--root', root, '--current', current];
    for (const [index, id] of ['a', 'b'].entries()) {
      const source = join(directory, id);
      makeRelease(source, `2.0.${index}`, id, index + 2);
      expect(run(['deploy', source, ...args], ROOT).status).toBe(0);
    }
    makeRelease(join(root, '2.0.2--unselected'), '2.0.2', 'unselected', 3);
    const history = readFileSync(`${current}.history.json`), selected = readlinkSync(current);
    const refused = run(['rollback', '--previous', ...args], ROOT);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('schemaMax 2 is lower than current 3');
    expect(readlinkSync(current)).toBe(selected);
    expect(readFileSync(`${current}.history.json`)).toEqual(history);
    expect(run(['rollback', '--previous', '--force', ...args], ROOT).status).toBe(0);
    expect(readlinkSync(current)).toContain('2.0.0--a');
  });

  test('bounds the PDF namespace to selected and previously active original releases, including rollback', () => {
    const directory = join(ROOT, 'pdf');
    const root = join(directory, 'releases'), current = join(directory, 'current');
    mkdirSync(join(root, 'unrelated'), { recursive: true });
    writeFileSync(join(root, 'unrelated/keep.txt'), 'operator file');
    const sources = ['a', 'b', 'c'].map((id, index) => {
      const source = join(directory, id);
      makeRelease(source, `2.0.${index}`, id, 90);
      const workers = join(source, '_app/immutable/workers');
      mkdirSync(workers, { recursive: true });
      writeFileSync(join(workers, `pdf-worker-${id}.js`), `PDF ${id}`);
      writeFileSync(join(workers, `pdf-worker-${id}.js.br`), `compressed PDF ${id}`);
      writeFileSync(join(workers, `sqlite3-worker1-bundler-friendly-${id}.js`), 'unused');
      return source;
    });
    const deploy = (source: string) => run(['deploy', source, '--root', root, '--current', current], ROOT);
    const namespace = () => readdirSync(join(root, '.pdf-current')).sort();
    expect(deploy(sources[0]).status).toBe(0);
    const a = readlinkSync(current);
    const originalA = readFileSync(join(a, 'release.json'));
    expect(deploy(sources[1]).status).toBe(0);
    const b = readlinkSync(current);
    const originalB = readFileSync(join(b, 'release.json'));
    expect(namespace()).toEqual(['pdf-worker-a.js', 'pdf-worker-a.js.br', 'pdf-worker-b.js', 'pdf-worker-b.js.br']);
    expect(existsSync(join(b, '_app/immutable/workers/pdf-worker-a.js'))).toBe(false);
    expect(readFileSync(join(root, '.pdf-current/pdf-worker-a.js'), 'utf8')).toBe('PDF a');
    expect(deploy(sources[2]).status).toBe(0);
    expect(namespace()).toEqual(['pdf-worker-b.js', 'pdf-worker-b.js.br', 'pdf-worker-c.js', 'pdf-worker-c.js.br']);
    expect(readdirSync(join(root, '.pdf-workers'))).toHaveLength(1);
    expect(run(['rollback', '2.0.0--a', '--root', root, '--current', current], ROOT).status).toBe(0);
    expect(readlinkSync(current)).toBe(a);
    expect(namespace()).toEqual(['pdf-worker-a.js', 'pdf-worker-a.js.br', 'pdf-worker-c.js', 'pdf-worker-c.js.br']);
    expect(readdirSync(join(root, '.pdf-workers'))).toHaveLength(1);
    expect(readFileSync(join(a, 'release.json'))).toEqual(originalA);
    expect(readFileSync(join(b, 'release.json'))).toEqual(originalB);
    expect(readdirSync(join(a, '_app/immutable/workers')).sort()).toEqual(readdirSync(join(sources[0], '_app/immutable/workers')).sort());
    expect(readFileSync(join(a, '_app/immutable/workers/pdf-worker-a.js'), 'utf8')).toBe('PDF a');
    expect(readFileSync(join(b, '_app/immutable/workers/pdf-worker-b.js'), 'utf8')).toBe('PDF b');
    expect(readFileSync(join(root, 'unrelated/keep.txt'), 'utf8')).toBe('operator file');
  });

  test('refuses different bytes under one PDF worker identity before switching either namespace', () => {
    const directory = join(ROOT, 'pdf-collision');
    const root = join(directory, 'releases'), current = join(directory, 'current');
    for (const [id, version] of [['a', '2.0.0'], ['b', '2.0.1']]) {
      const source = join(directory, id);
      makeRelease(source, version, id, 90);
      const workers = join(source, '_app/immutable/workers');
      mkdirSync(workers, { recursive: true });
      writeFileSync(join(workers, 'pdf-worker-same.js'), id);
    }
    expect(run(['deploy', join(directory, 'a'), '--root', root, '--current', current], ROOT).status).toBe(0);
    const selected = readlinkSync(current), namespace = readlinkSync(join(root, '.pdf-current'));
    const result = run(['deploy', join(directory, 'b'), '--root', root, '--current', current], ROOT);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('PDF worker identity collision');
    expect(readlinkSync(current)).toBe(selected);
    expect(readlinkSync(join(root, '.pdf-current'))).toBe(namespace);
    expect(readdirSync(join(root, '.pdf-workers'))).toHaveLength(1);
  });

  test('deploys and rolls back when the PDF worker identity has not changed', () => {
    const directory = join(ROOT, 'pdf-unchanged');
    const root = join(directory, 'releases'), current = join(directory, 'current');
    for (const [id, version] of [['a', '2.0.0'], ['b', '2.0.1']]) {
      const source = join(directory, id);
      makeRelease(source, version, id, 90);
      const workers = join(source, '_app/immutable/workers');
      mkdirSync(workers, { recursive: true });
      writeFileSync(join(workers, 'pdf-worker-same.js'), 'unchanged PDF worker');
      expect(run(['deploy', source, '--root', root, '--current', current], ROOT).status).toBe(0);
    }
    expect(readdirSync(join(root, '.pdf-current'))).toEqual(['pdf-worker-same.js']);
    expect(run(['rollback', '2.0.0--a', '--root', root, '--current', current], ROOT).status).toBe(0);
    expect(readFileSync(join(root, '.pdf-current/pdf-worker-same.js'), 'utf8')).toBe('unchanged PDF worker');
  });

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
    writeFileSync(legacyPath, gunzipSync(readFileSync('scripts/vendor/legacy-ocr/pre21-tesseract.js.gz')));
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
    writeFileSync(source, gunzipSync(readFileSync('scripts/vendor/legacy-ocr/pre21-tesseract.js.gz')));
    mkdirSync(join(next, 'tesseract'), { recursive: true });
    writeFileSync(join(next, 'tesseract/assets.json'), JSON.stringify({ legacyRuntime: legacyOcr }));
    const deploy = (path: string) => spawnSync('node', [join(operator, 'journal-release.mjs'),
      'deploy', path, '--root', root, '--current', current], { encoding: 'utf8' });
    expect(deploy(old).status).toBe(0); expect(deploy(next).status).toBe(0);
    expect(readFileSync(join(readlinkSync(current), legacyOcr[0].path))).toEqual(readFileSync(source));
  });

  test('refuses missing legacy runtime without switching current or changing the old release', () => {
    const directory = join(ROOT, 'ocr-missing');
    const root = join(directory, 'releases'), current = join(directory, 'current');
    const old = join(directory, 'old'), next = join(directory, 'next');
    makeRelease(old, '2.0.0', 'a', 88); makeRelease(next, '2.0.1', 'b', 88);
    mkdirSync(join(next, 'tesseract'), { recursive: true });
    writeFileSync(join(next, 'tesseract/assets.json'), JSON.stringify({ legacyRuntime: legacyOcr }));
    expect(run(['deploy', old, '--root', root, '--current', current], ROOT).status).toBe(0);
    const previous = readlinkSync(current);
    const before = readFileSync(join(previous, 'release.json'));
    const result = run(['deploy', next, '--root', root, '--current', current], ROOT);
    expect(result.status).toBe(1); expect(result.stderr).toContain('Missing legacy OCR runtime');
    expect(readlinkSync(current)).toBe(previous);
    expect(readFileSync(join(previous, 'release.json'))).toEqual(before);
    expect(readdirSync(root)).toEqual(['.pdf-current', '.pdf-workers', '2.0.0--a']);
  });

  test.each([false, true])('uses the verified staged fallback with previous release=%s', (withPrevious) => {
    const directory = join(ROOT, `ocr-staged-${withPrevious}`);
    const root = join(directory, 'releases'), current = join(directory, 'current');
    if (withPrevious) {
      const old = join(directory, 'old'); makeRelease(old, '2.0.0', 'a', 88);
      expect(run(['deploy', old, '--root', root, '--current', current], ROOT).status).toBe(0);
    }
    const next = join(directory, 'next'); makeRelease(next, '2.0.1', 'b', 88);
    mkdirSync(join(next, 'tesseract'), { recursive: true });
    writeFileSync(join(next, 'tesseract/assets.json'), JSON.stringify({ legacyRuntime: legacyOcr }));
    const runtime = join(next, legacyOcr[0].path);
    mkdirSync(join(runtime, '..'), { recursive: true });
    const expected = gunzipSync(readFileSync('scripts/vendor/legacy-ocr/pre21-tesseract.js.gz'));
    writeFileSync(runtime, expected);
    expect(run(['deploy', next, '--root', root, '--current', current], ROOT).status).toBe(0);
    expect(readFileSync(join(readlinkSync(current), legacyOcr[0].path))).toEqual(expected);
  });

  test('refuses an altered staged legacy fallback before switching current', () => {
    const directory = join(ROOT, 'ocr-staged-corrupt');
    const root = join(directory, 'releases'), current = join(directory, 'current');
    const old = join(directory, 'old'), next = join(directory, 'next');
    makeRelease(old, '2.0.0', 'a', 88); makeRelease(next, '2.0.1', 'b', 88);
    expect(run(['deploy', old, '--root', root, '--current', current], ROOT).status).toBe(0);
    const previous = readlinkSync(current);
    mkdirSync(join(next, 'tesseract'), { recursive: true });
    writeFileSync(join(next, 'tesseract/assets.json'), JSON.stringify({ legacyRuntime: legacyOcr }));
    const runtime = join(next, legacyOcr[0].path);
    mkdirSync(join(runtime, '..'), { recursive: true }); writeFileSync(runtime, 'altered');
    const result = run(['deploy', next, '--root', root, '--current', current], ROOT);
    expect(result.status).toBe(1); expect(result.stderr).toContain('Legacy OCR identity mismatch');
    expect(readlinkSync(current)).toBe(previous); expect(readdirSync(root)).toEqual(['.pdf-current', '.pdf-workers', '2.0.0--a']);
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

  test('rollback --previous switches to the recorded previous release', () => {
    const root = join(ROOT, 'previous', 'releases');
    const current = join(ROOT, 'previous', 'current');
    const firstSource = join(ROOT, 'previous', 'a'), secondSource = join(ROOT, 'previous', 'b');
    makeRelease(firstSource, '2.0.0', 'a', 4); makeRelease(secondSource, '2.0.1', 'b', 4);
    expect(run(['deploy', firstSource, '--root', root, '--current', current], ROOT).status).toBe(0);
    expect(run(['deploy', secondSource, '--root', root, '--current', current], ROOT).status).toBe(0);

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
