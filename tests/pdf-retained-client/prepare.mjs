/* Build two app releases with different PDF worker bytes. Restore the source
   marker even when a build fails; neither release is published. */
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';

assert(process.argv[2], 'Supply an owned output directory');
const output = resolve(process.argv[2]);
const worker = 'src/lib/data/documents/pdf-worker.ts';
const original = readFileSync(worker, 'utf8');
try {
  for (const release of ['A', 'B']) {
    writeFileSync(worker, original + `\nObject.defineProperty(globalThis, '__pdfRelease', { value: '${release}' });\n`);
    await new Promise((resolveBuild, reject) => {
      const child = spawn('npm', ['run', 'build'], { stdio: 'inherit', env: { ...process.env, ENGENDER_VERSION: `0.0.0-pdf-${release}` } });
      child.once('error', reject);
      child.once('exit', code => code === 0 ? resolveBuild() : reject(new Error(`Release ${release} build exited ${code}`)));
    });
    const root = join(output, release);
    mkdirSync(root, { recursive: true });
    cpSync('build', join(root, 'build'), { recursive: true });
    const workers = readdirSync('build/_app/immutable/workers').filter(name => /^pdf-worker-.*\.js$/.test(name));
    assert.equal(workers.length, 1, 'Expected one PDF worker');
    const entries = [...new Set(readFileSync('build/index.html', 'utf8').match(/\/_app\/immutable\/entry\/(?:start|app)\.[^"\s]+\.js/g))];
    const version = JSON.parse(readFileSync('build/_app/version.json', 'utf8')).version;
    writeFileSync(join(root, 'probe.json'), JSON.stringify({ release, version, entries,
      worker: '/_app/immutable/workers/' + workers[0] }, null, 2) + '\n');
  }
} finally {
  writeFileSync(worker, original);
}
