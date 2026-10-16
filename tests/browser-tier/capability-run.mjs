import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

// This digest contains the browser revisions shipped by playwright-core 1.63.0.
const image = 'mcr.microsoft.com/playwright:v1.63.0-noble@sha256:bc6ab0d6d44ff4826e4cb8c1e6d801e185bfc42bb0753f8e2a30efc70db054c7';
const pinnedVersion = '1.63.0';
const version = JSON.parse(await readFile('node_modules/playwright-core/package.json', 'utf8')).version;
if (version !== pinnedVersion) throw new Error(`Playwright ${version} does not match matrix image ${pinnedVersion}; update both pins before running.`);
const selection = process.argv[2] ?? 'all';
if (!['all', 'production', 'lifecycle'].includes(selection)) throw new Error('Use all, production or lifecycle');
const tiers = selection === 'all' ? ['production', 'lifecycle'] : [selection];
const root = process.cwd();
const output = resolve(process.env.CAPABILITY_OUTPUT ?? `.claude/browser-capabilities/tip-${Date.now()}`);
await mkdir(dirname(output), { recursive: true });
await mkdir(output); // Refuse stale evidence, including engine launch failures.
const gitDirectory = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== '';
const build = JSON.parse(await readFile('build/release.json', 'utf8'));
const startedAt = new Date().toISOString();
const matrix = { revision, dirty, build, startedAt, purpose: 'pre-release; not part of routine CI', image, playwrightVersion: version, engines: [], results: [], invocations: [], limitations: [] };
async function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env: { ...process.env, ...env } });
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal }));
  });
}
try {
  for (const engine of (process.env.CAPABILITY_ENGINES ?? 'chromium,firefox,webkit').split(',')) {
    if (!['chromium', 'firefox', 'webkit'].includes(engine)) throw new Error(`Unknown browser engine: ${engine}`);
    for (const tier of tiers) {
      const directory = resolve(output, `${engine}-${tier}`);
      const env = { CAPABILITY_ENGINES: engine, CAPABILITY_OUTPUT: directory };
      let result;
      let runtime = { kind: 'host' };
      if (engine === 'webkit') {
        const name = `engender-capabilities-${randomUUID()}`;
        runtime = { kind: 'container', image, name };
        console.log('Owned matrix container:', name, engine, tier);
        result = await run(process.env.CONTAINER_RUNTIME ?? 'podman', ['run', '--rm', '--init', '--name', name,
          '--ipc=host', '--security-opt', 'label=disable', '-v', `${root}:${root}`, '-v', `${gitDirectory}:${gitDirectory}:ro`,
          ...(output.startsWith(root + '/') ? [] : ['-v', `${output}:${output}`]), '-w', root,
          '-e', 'HOME=/tmp', '-e', `CAPABILITY_ENGINES=${engine}`, '-e', `CAPABILITY_OUTPUT=${directory}`,
          '-e', 'GIT_OPTIONAL_LOCKS=0', '-e', 'GIT_CONFIG_COUNT=1', '-e', 'GIT_CONFIG_KEY_0=safe.directory', '-e', `GIT_CONFIG_VALUE_0=${root}`,
          image, ...(process.env.CAPABILITY_CPUS ? ['taskset', '-c', process.env.CAPABILITY_CPUS] : []), 'sh', '-c', 'apt-get update -qq >/dev/null && apt-get install -y -qq espeak-ng ffmpeg >/dev/null && node tests/browser-tier/capability-matrix.mjs "$1"', 'matrix', tier], {});
      } else result = await run(process.execPath, ['tests/browser-tier/capability-matrix.mjs', tier], env);
      const evidence = await readFile(resolve(directory, 'matrix.json'), 'utf8').then(JSON.parse).catch(() => null);
      matrix.invocations.push({ engine, tier, runtime, ...result, evidence: evidence ? `${engine}-${tier}/matrix.json` : null });
      if (evidence) {
        matrix.engines.push({ engine, tier, revision: evidence.revision, dirty: evidence.dirty, build: evidence.build,
          os: evidence.os, sourceIdentity: evidence.sourceIdentity, bfcacheControls: evidence.bfcacheControls, durationMs: evidence.durationMs });
        matrix.results.push(...evidence.results.map(row => ({ ...row, tier })));
        matrix.limitations.push(...evidence.limitations);
      } else matrix.results.push({ engine, tier, capability: 'engine-matrix', status: 'not-run', evidence: result });
      await writeFile(resolve(output, 'matrix.json'), JSON.stringify(matrix, null, 2) + '\n');
    }
  }
} finally {
  matrix.finishedRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  matrix.finishedAt = new Date().toISOString();
  matrix.durationMs = Date.now() - Date.parse(startedAt);
  matrix.limitations = [...new Set(matrix.limitations)];
  await writeFile(resolve(output, 'matrix.json'), JSON.stringify(matrix, null, 2) + '\n');
  console.log('Combined capability evidence:', output);
}
if (matrix.finishedRevision !== revision || matrix.invocations.some(row => row.code !== 0 || row.signal) || matrix.results.some(row => row.status === 'fail')) process.exitCode = 1;
