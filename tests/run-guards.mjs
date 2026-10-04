import { spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, globSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import { execute, writeSummary } from '../scripts/check-process.mjs';

/** @typedef {{ name: string, tier: string, holds: string, args?: string[], build?: string, diagnostics?: string[] }} Guard */

/** @typedef {{ guards: Record<string, number>, builds: Record<string, number> }} Timings */

/** @param {Guard[]} guards @param {string} tier @param {string | undefined} [shard] @param {Timings} [timings] */
export function selectGuards(guards, tier, shard, timings) {
  if (!['dev', 'built'].includes(tier)) throw new Error(`Invalid tier: ${tier}. Use dev or built.`);
  const selected = guards.filter((guard) => guard.tier === tier);
  if (!shard) return selected;
  const [part, total] = shard.split('/').map(Number);
  if (!/^\d+\/\d+$/.test(shard) || part < 1 || part > total || total > selected.length) throw new Error(`Invalid shard: ${shard}. Use N/M with no empty groups.`);
  const measured = timings ?? JSON.parse(readFileSync(new URL('./guard-durations.json', import.meta.url), 'utf8'));
  for (const guard of selected) {
    if (!(measured.guards[guard.name] > 0)) throw new Error(`Missing duration for guard: ${guard.name}`);
  }
  const groups = Array.from({ length: total }, () => ({ seconds: 0, builds: new Set(), names: new Set() }));
  for (const guard of [...selected].sort((a, b) => measured.guards[b.name] - measured.guards[a.name])) {
    const build = tier === 'built' ? guard.build ?? 'demo' : null;
    if (build && !(measured.builds[build] > 0)) throw new Error(`Missing duration for build: ${build}`);
    const cost = (/** @type {typeof groups[number]} */ group) => group.seconds + (build && !group.builds.has(build) ? measured.builds[build] : 0);
    const group = groups.reduce((best, candidate) => cost(candidate) < cost(best) ? candidate : best);
    group.seconds = cost(group) + measured.guards[guard.name];
    if (build) group.builds.add(build);
    group.names.add(guard.name);
  }
  // Preserve roster order so production runs after demo in each job's build directory.
  return selected.filter((guard) => groups[part - 1].names.has(guard.name));
}

/**
 * @param {Guard[]} guards
 * @param {{ run?: typeof execute, log?: (line: string) => void, blocked?: boolean, evidenceDir?: string, revision?: string }} options
 */
export async function runGuards(guards, { run = execute, log = console.log, blocked = false, evidenceDir, revision = 'unavailable' } = {}) {
  const builds = new Map();
  const results = [];
  for (const guard of guards) {
    const start = performance.now();
    const build = guard.tier === 'built' ? guard.build ?? 'demo' : null;
    if (!blocked && build && !builds.has(build)) {
      log(`\nBuild: ${build}`);
      builds.set(build, await run('npm', ['run', 'build'], { VITE_DEMO: build === 'demo' ? '1' : '0' }));
    }
    const buildFailed = blocked || (!!build && builds.get(build) !== 0);
    const attempts = [];
    if (!buildFailed) {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        log(`\nGuard: ${guard.name}, attempt ${attempt}/2`);
        const directory = evidenceDir ? join(evidenceDir, guard.name, `attempt-${attempt}`) : undefined;
        const logFile = directory ? join(directory, 'output.log') : undefined;
        const before = directory ? diagnosticFiles(guard.diagnostics ?? []) : new Map();
        const startedAt = new Date().toISOString();
        if (directory && logFile) {
          mkdirSync(directory, { recursive: true });
          writeFileSync(logFile, `${JSON.stringify({ name: guard.name, revision, attempt, startedAt })}\n`);
        }
        const attemptStart = performance.now();
        const code = await run(process.execPath, [`tests/${guard.name}.mjs`, ...(guard.args ?? [])], {}, process.cwd(), logFile);
        const result = { name: guard.name, revision, attempt, code, startedAt, finishedAt: new Date().toISOString(), durationMs: performance.now() - attemptStart };
        if (directory && logFile) {
          for (const [path, signature] of diagnosticFiles(guard.diagnostics ?? [])) {
            if (before.get(path) === signature) continue;
            const target = join(directory, 'diagnostics', isAbsolute(path) ? path.slice(1) : path);
            mkdirSync(dirname(target), { recursive: true });
            copyFileSync(path, target);
          }
          appendFileSync(logFile, `\n${JSON.stringify(result)}\n`);
          writeFileSync(join(directory, 'result.json'), JSON.stringify(result, null, 2) + '\n');
        }
        attempts.push(result);
        if (code === 0) break;
      }
    }
    const passed = !buildFailed && attempts.at(-1)?.code === 0;
    const outcome = buildFailed ? 'blocked' : !passed ? 'failed' : attempts.length > 1 ? 'recovered' : 'passed';
    results.push({ name: guard.name, passed, outcome, buildFailed, attempts, durationMs: performance.now() - start });
  }
  log('\nGuard results:');
  log('Result and guard | Seconds | Attempts (exit code, seconds)');
  for (const row of results) {
    const attempts = row.buildFailed ? (blocked ? 'job setup failed; guard did not run' : 'build failed; guard did not run') : row.attempts.map((attempt) => `${attempt.code}, ${(attempt.durationMs / 1000).toFixed(2)}s`).join(' / ');
    log(`${row.outcome === 'passed' ? 'PASS' : row.outcome === 'failed' ? 'FAIL' : row.outcome.toUpperCase()} ${row.name} | ${(row.durationMs / 1000).toFixed(2)} | ${attempts}`);
  }
  log(`${results.filter((row) => !row.passed).length} failed or blocked, ${results.filter((row) => row.outcome === 'recovered').length} recovered, ${results.filter((row) => row.outcome === 'passed').length} passed`);
  return results;
}

/** @param {string[]} patterns */
function diagnosticFiles(patterns) {
  const files = new Map();
  for (const path of globSync(patterns)) {
    const stat = lstatSync(path, { bigint: true });
    if (stat.isFile()) files.set(path, `${stat.mtimeNs}:${stat.ctimeNs}:${stat.size}`);
  }
  return files;
}

/** @param {string} logFile */
function failureExcerpt(logFile) {
  const lines = stripVTControlCharacters(readFileSync(logFile, 'utf8')).trimEnd().split('\n').slice(1, -1);
  const firstFailure = lines.findIndex((line) => /\bFAIL(?:ED)?\b|\b\w*Error(?: \[[^\]]+\])?:|\bERROR\b|stopped by SIG/i.test(line));
  return lines.slice(firstFailure < 0 ? -12 : firstFailure, firstFailure < 0 ? undefined : firstFailure + 12)
    .join('\n').slice(0, 2400).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const tier = args[args.indexOf('--tier') + 1];
  const shard = args.includes('--shard') ? args[args.indexOf('--shard') + 1] : undefined;
  try {
    if (!args.includes('--tier') || !tier || (args.includes('--shard') && !shard)) throw new Error('Usage: node tests/run-guards.mjs --tier dev|built [--shard N/M] [--blocked]');
    const guards = JSON.parse(readFileSync(new URL('./guards.json', import.meta.url), 'utf8'));
    const revision = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout?.trim() || 'unavailable';
    mkdirSync('ci-logs/guards', { recursive: true });
    const evidenceDir = mkdtempSync('ci-logs/guards/run-');
    const results = await runGuards(selectGuards(guards, tier, shard), { blocked: args.includes('--blocked'), evidenceDir, revision });
    writeFileSync(join(evidenceDir, 'results.json'), JSON.stringify({ revision, tier, shard, results }, null, 2) + '\n');
    writeSummary([
      `Tested revision: \`${revision}\``, '', `Attempt logs and diagnostics: \`${evidenceDir}\``, '',
      '| Guard | Result | Seconds | Attempts (exit code, seconds) |', '| --- | --- | --- | --- |',
      ...results.map((row) => `| ${row.name} | ${row.outcome} | ${(row.durationMs / 1000).toFixed(2)} | ${row.buildFailed ? (args.includes('--blocked') ? 'job setup failed; guard did not run' : 'build failed; guard did not run') : row.attempts.map((attempt) => `attempt ${attempt.attempt}: exit ${attempt.code}, ${(attempt.durationMs / 1000).toFixed(2)}s`).join('; ')} |`)
    ]);
    for (const row of results) {
      for (const attempt of row.attempts.filter((attempt) => attempt.code !== 0)) {
        const logFile = join(evidenceDir, row.name, `attempt-${attempt.attempt}`, 'output.log');
        writeSummary([
          '', `Failed case output: ${row.name}, attempt ${attempt.attempt}`, '',
          `Full log in the artifact: \`${logFile}\``, '',
          '<pre>', failureExcerpt(logFile), '</pre>'
        ]);
      }
    }
    process.exitCode = results.some((row) => !row.passed) ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
