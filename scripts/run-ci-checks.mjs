import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execute, writeSummary } from './check-process.mjs';

/** @typedef {{ id: string, name: string, command: string, args: string[], requires?: string[], cwd?: string }} Check */

/** @type {Record<string, Check[]>} */
export const CI_CHECKS = {
  node: [
    { id: 'ai-directories', name: 'Untracked AI working directories', command: 'npm', args: ['run', 'check:ai-directories'] },
    { id: 'build', name: 'Production build', command: 'npm', args: ['run', 'build'] },
    { id: 'types', name: 'Svelte and TypeScript', command: 'npm', args: ['run', 'check'], requires: ['build'] },
    { id: 'node', name: 'Node tier', command: 'npm', args: ['test', '--', '--maxWorkers=2'], requires: ['build'] },
    { id: 'copy', name: 'Message catalogues and user-facing literals', command: 'npm', args: ['run', 'check:copy'] },
    { id: 'licences', name: 'Dependency licences', command: 'npm', args: ['run', 'check:licences'] },
    { id: 'classes', name: 'screens.css single-consumer classes', command: 'npm', args: ['run', 'check:screens-classes'] },
    { id: 'progressive-release', name: 'Progressive release evidence', command: 'npm', args: ['run', 'check:progressive-release'] },
    { id: 'budget', name: 'First-load budget', command: 'npm', args: ['run', 'check:first-load-budget'], requires: ['build'] }
  ],
  android: [
    { id: 'build', name: 'Web production build', command: 'npm', args: ['run', 'build'] },
    { id: 'sync', name: 'Capacitor sync', command: 'npx', args: ['cap', 'sync', 'android'], requires: ['build'] },
    { id: 'policy', name: 'Android dependency policy', command: 'node', args: ['scripts/check-android-dependencies.mjs'], requires: ['sync'] },
    { id: 'apk', name: 'Unsigned debug APK', command: './gradlew', args: [':app:assembleDebug'], cwd: 'android', requires: ['sync'] },
    { id: 'preserve-apk', name: 'Preserve debug APK', command: 'node', args: ['scripts/preserve-debug-apk.mjs'], requires: ['apk'] },
    { id: 'fdroid', name: 'F-Droid rebuild attempt', command: 'node', args: ['scripts/fdroid-rebuild-report.mjs'], requires: ['sync'] }
  ]
};

/** @param {Check[]} checks @param {{ run?: typeof execute, log?: (line: string) => void, blocked?: boolean }} options */
export async function runChecks(checks, { run = execute, log = console.log, blocked = false } = {}) {
  /** @type {{ id: string, name: string, outcome: string, code: number | null, durationMs: number, reason: string }[]} */
  const results = [];
  for (const check of checks) {
    const missing = (check.requires ?? []).filter((id) => results.find((result) => result.id === id)?.outcome !== 'passed');
    if (blocked || missing.length) {
      results.push({ id: check.id, name: check.name, outcome: 'blocked', code: null, durationMs: 0, reason: blocked ? 'job setup failed' : `prerequisites did not pass: ${missing.join(', ')}` });
      continue;
    }
    log(`\nCheck: ${check.name}`);
    const start = performance.now();
    const code = await run(check.command, check.args, {}, check.cwd ? resolve(check.cwd) : process.cwd());
    results.push({ id: check.id, name: check.name, outcome: code === 0 ? 'passed' : 'failed', code, durationMs: performance.now() - start, reason: '' });
  }
  log('\nCI check results:');
  for (const result of results) {
    const status = result.outcome === 'passed' ? 'PASS' : result.outcome === 'failed' ? 'FAIL' : 'BLOCKED';
    log(`${status} ${result.name} | ${(result.durationMs / 1000).toFixed(2)}s | ${result.reason || `exit ${result.code}`}`);
  }
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const tier = args[args.indexOf('--tier') + 1];
  try {
    if (!args.includes('--tier') || !CI_CHECKS[tier]) throw new Error('Usage: node scripts/run-ci-checks.mjs --tier node|android [--blocked]');
    const results = await runChecks(CI_CHECKS[tier], { blocked: args.includes('--blocked') });
    writeSummary([
      '| Check | Result | Seconds | Detail |', '| --- | --- | --- | --- |',
      ...results.map((result) => `| ${result.name} | ${result.outcome} | ${(result.durationMs / 1000).toFixed(2)} | ${result.reason || `exit ${result.code}`} |`)
    ]);
    process.exitCode = results.some((result) => result.outcome !== 'passed') ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
