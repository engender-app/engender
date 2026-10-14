/* Build two real app releases whose deferred screen and SQLite worker differ.
   Only disposable source markers change; restore source even if a build fails. */
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';

const output = resolve(process.argv[2] ?? '');
assert(process.argv[2], 'Supply an owned output directory');
const route = 'src/routes/settings/licences/+page.svelte';
const worker = 'src/lib/data/sqlite/mc-worker.ts';
const originals = new Map([route, worker].map(path => [path, readFileSync(path, 'utf8')]));
try {
  for (const release of ['A', 'B']) {
    writeFileSync(route, originals.get(route).replace('<div class="screen">', `<div class="screen" data-retained-release="${release}">`));
    writeFileSync(worker, originals.get(worker) + `\nObject.defineProperty(globalThis, '__retainedRelease', { value: '${release}' });\n`);
    await new Promise((resolveBuild, reject) => {
      const child = spawn('npm', ['run', 'build'], { stdio: 'inherit', env: { ...process.env, ENGENDER_VERSION: `0.0.0-retained-${release}` } });
      child.once('error', reject);
      child.once('exit', code => code === 0 ? resolveBuild() : reject(new Error(`Release ${release} build exited ${code}`)));
    });
    const root = join(output, release);
    mkdirSync(root, { recursive: true });
    cpSync('build', join(root, 'build'), { recursive: true });
    const manifest = JSON.parse(readFileSync('.svelte-kit/output/client/.vite/manifest.json', 'utf8'));
    const node = Object.keys(manifest).find(key => key.includes('/nodes/') && readFileSync(key, 'utf8').includes('routes/settings/licences/+page.svelte'));
    assert(node, 'The built licence route node is missing');
    const workers = readdirSync('build/_app/immutable/workers').filter(name => /^mc-worker-.*\.js$/.test(name));
    assert.equal(workers.length, 1, 'Expected one encrypted SQLite worker');
    const entries = [...new Set(readFileSync('build/index.html', 'utf8').match(/\/_app\/immutable\/entry\/(?:start|app)\.[^\"\s]+\.js/g))];
    const version = JSON.parse(readFileSync('build/_app/version.json', 'utf8')).version;
    writeFileSync(join(root, 'probe.json'), JSON.stringify({ release, version, entries, route: '/' + manifest[node].file,
      worker: '/_app/immutable/workers/' + workers[0] }, null, 2) + '\n');
  }
} finally {
  for (const [path, source] of originals) writeFileSync(path, source);
}
