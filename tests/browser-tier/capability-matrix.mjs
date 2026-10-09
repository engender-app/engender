import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { platform, release, arch } from 'node:os';
import { browserEngine, launchBrowser } from '../browser-harness.mjs';
import { invocationFailed, runCapabilityInvocation } from './capability-invocation.mjs';

const tier = process.argv[2] ?? 'production';
if (!['production', 'lifecycle'].includes(tier)) throw new Error('Use production or lifecycle');
const engines = (process.env.CAPABILITY_ENGINES ?? 'chromium,firefox,webkit').split(',');
const directory = resolve(process.env.CAPABILITY_OUTPUT ?? `.claude/browser-capabilities/${tier}-${Date.now()}`);
await mkdir(dirname(directory), { recursive: true });
await mkdir(directory); // Refuse reused evidence directories and stale case JSON.
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim() !== '';
const build = JSON.parse(await readFile('build/release.json', 'utf8'));
const matrix = { revision, dirty, tier, build, os: { platform: platform(), release: release(), arch: arch(), distribution: await readFile('/etc/os-release', 'utf8').catch(() => 'unavailable') },
  startedAt: new Date().toISOString(), results: [], invocations: [], limitations: [
    'Automated WebKit is engine evidence, not desktop Safari or an installed iOS PWA.',
    'Actual Safari and iOS PWA remain unverified. Apple hardware is not a prerequisite.',
    'Synthetic media devices do not verify physical camera or microphone hardware.'
  ] };
const suites = tier === 'production' ? [
  { path: 'tests/browser-tier/verify-build.mjs', capabilities: ['release-shell-offline-optional-assets'], mode: 'production' },
  { path: 'tests/browser-tier/built-capabilities.mjs', capabilities: [
    'production-headers', 'persistence-denial', 'encrypted-reopen', 'browser-back', 'multi-tab-ownership',
    'biometric-advertisement', 'biometric-negotiation-refusal', 'quota-failure-preserves-data', 'photo-import-playback', 'audio-import-playback',
    'video-import-playback', 'audio-capture-playback', 'video-capture-playback', 'document-import-render',
    'manual-archive-recovery', 'pending-persistence-request', 'missing-storage-api', 'uncaught-errors'
  ], mode: 'production', detailed: true },
  { path: 'tests/update-handover-check.mjs', capabilities: ['schema-recovery-update', 'update-during-write'], mode: 'real-driver lifecycle probe' },
  { path: 'tests/pending-unlock-lock-check.mjs', capabilities: ['pending-unlock-later-lock'], mode: 'development demo' }
] : [
  { path: 'tests/bfcache-journal-check.mjs', capabilities: ['actual-bfcache-return'], mode: 'built production' }
];
function capabilities(engine, suite) {
  return [...suite.capabilities, ...(engine === 'webkit' && suite.detailed ? ['private-context-opfs'] : [])];
}
matrix.results = engines.flatMap(engine => suites.flatMap(suite => [
  ...capabilities(engine, suite),
  ...(suite.path.endsWith('verify-build.mjs') ? ['installation-audit'] : [])
].map(capability => ({ engine, capability, status: 'not-run', mode: suite.mode, evidence: 'Case has not executed.' }))));
function record(row) {
  const index = matrix.results.findIndex(item => item.engine === row.engine && item.capability === row.capability);
  matrix.results[index] = row;
}
async function checkpoint() {
  await writeFile(resolve(directory, 'matrix.json'), JSON.stringify(matrix, null, 2) + '\n');
}
await checkpoint();


try {
  for (const engine of engines) {
    process.env.BROWSER_ENGINE = engine;
    browserEngine();
    let version;
    try {
      const browser = await launchBrowser();
      version = browser.version();
      await browser.close();
    } catch (error) {
      for (const suite of suites) for (const capability of capabilities(engine, suite)) record({ engine, capability, status: 'not-run', evidence: `Runtime launch failed: ${error.message}`, mode: suite.mode });
      console.error('NOT-RUN', engine, error.message);
      await checkpoint();
      continue;
    }
    for (const row of matrix.results.filter(row => row.engine === engine)) row.version = version;
    await checkpoint();
    for (const [index, suite] of suites.entries()) {
      const prefix = `${engine}-${index}`;
      const log = resolve(directory, `${prefix}.log`);
      const resultsFile = resolve(directory, `${prefix}.json`);
      const result = await runCapabilityInvocation(suite.path, { env: { BROWSER_ENGINE: engine, CAPABILITY_RESULTS: resultsFile, ...(tier === 'lifecycle' ? { BFCACHE_BUILD_MODE: 'production' } : {}) }, log, resultsFile });
      matrix.invocations.push({ engine, version, script: suite.path, mode: suite.mode, code: result.code, signal: result.signal, timedOut: result.timedOut, startupError: result.startupError, log });
      if (suite.detailed) {
        const rows = result.cases;
        for (const capability of capabilities(engine, suite)) {
          const row = rows.find(row => row.capability === capability);
          record({ engine, version, capability, status: row?.status ?? 'not-run', mode: suite.mode,
            evidence: row?.evidence ?? `Process ended before case: code=${result.code}, signal=${result.signal}`, log });
        }
      } else for (const capability of capabilities(engine, suite)) record({ engine, version, capability,
        status: invocationFailed(result) ? 'fail' : 'pass', mode: suite.mode, evidence: { code: result.code, signal: result.signal, timedOut: result.timedOut, startupError: result.startupError }, log });
      if (suite.path.endsWith('verify-build.mjs')) record({ engine, version, capability: 'installation-audit',
        status: engine !== 'chromium' ? 'unsupported' : invocationFailed(result) ? 'fail' : 'pass', mode: suite.mode,
        evidence: engine !== 'chromium' ? 'CDP installation audit is Chromium-only. Service-worker offline engine checks recorded separately.' : 'Chromium manifest/installability audit; no OS installation asserted.', log });
      await checkpoint();
    }
  }
} finally {
  matrix.finishedAt = new Date().toISOString();
  await checkpoint();
  console.log('Capability evidence:', directory);
  for (const row of matrix.results) console.log(row.status.toUpperCase(), row.engine, row.version ?? 'unavailable', row.capability);
}
if (matrix.invocations.some(invocationFailed) || matrix.results.some(row => row.status === 'fail' || row.status === 'not-run' && !row.capability.includes('capture') && row.capability !== 'biometric-negotiation-refusal')) process.exitCode = 1;
