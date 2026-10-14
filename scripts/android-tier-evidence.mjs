import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** @typedef {{revision: string, startedAt: string}} AndroidStart */
/** @typedef {{avd: string, serial: string, api: number, nativeOnly: boolean, kind: string, completedStages: string[], completedChecks: string[], build: {apkSha256: string, testApkSha256: string}, revision?: string, startedAt?: string, passedAt?: string}} AndroidRun */
/** @typedef {{revision: string, startedAt: string, passedAt: string, runs: AndroidRun[], optionalStages: Record<string, string | null>}} AndroidEvidence */

export const ANDROID_CORE_STAGES = ['instrumentation', 'pin-wait', 'native-backup'];
const RECORD = 'scripts/progressive-release-record.json';
const sha = /^[a-f0-9]{40}$/;
const digest = /^[a-f0-9]{64}$/;
/** @param {string} cwd @param {...string} args */
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** @param {string} cwd @param {unknown} revision @param {string} [head] */
export function sameAndroidSource(cwd, revision, head = 'HEAD') {
  if (typeof revision !== 'string' || !sha.test(revision)) return false;
  try {
    git(cwd, 'merge-base', '--is-ancestor', revision, head);
    return !git(cwd, 'diff', '--name-only', revision, head, '--', '.', `:(exclude)${RECORD}`);
  } catch { return false; }
}

/** @param {string} cwd */
export function beginAndroidTier(cwd) {
  if (git(cwd, 'status', '--porcelain')) throw new Error('Android evidence requires a clean working tree before the run.');
  return { revision: git(cwd, 'rev-parse', 'HEAD'), startedAt: new Date().toISOString() };
}

/** @param {string} cwd */
export function androidBuildIdentity(cwd) {
  /** @param {string} path */
  const hash = (path) => createHash('sha256').update(readFileSync(join(cwd, path))).digest('hex');
  return {
    apkSha256: hash('android/app/build/outputs/apk/debug/app-debug.apk'),
    testApkSha256: hash('android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk')
  };
}

/** @param {unknown} evidence @param {string} candidateRevision @param {string} cwd */
export function androidTierProblems(evidence, candidateRevision, cwd) {
  if (!evidence || typeof evidence !== 'object') return ['Missing Android-tier evidence; run npm run test:android on the clean candidate.'];
  const data = /** @type {AndroidEvidence} */ (evidence);
  const problems = [];
  if (!sameAndroidSource(cwd, data.revision) || !sameAndroidSource(cwd, candidateRevision, data.revision)) {
    problems.push('Android-tier revision differs from candidate source.');
  }
  const started = Date.parse(data.startedAt);
  const passed = Date.parse(data.passedAt);
  let committed = Infinity;
  try { committed = Number(git(cwd, 'show', '-s', '--format=%ct', data.revision)) * 1000; } catch {}
  if (!Number.isFinite(started) || !Number.isFinite(passed) || started < committed || passed < started || passed > Date.now()) {
    problems.push('Android-tier timestamps are missing or stale for the tested revision.');
  }
  const runs = Array.isArray(data.runs) ? data.runs : [];
  for (const run of runs) {
    if (!sameAndroidSource(cwd, run?.revision) || !Number.isFinite(Date.parse(run?.startedAt ?? '')) ||
        !Number.isFinite(Date.parse(run?.passedAt ?? '')) || Date.parse(run.passedAt ?? '') < Date.parse(run.startedAt ?? '')) {
      problems.push('Android-tier run lacks matching source revision or completion timestamps.');
    }
    if (!run || typeof run !== 'object' || !run.avd || !run.serial || !Number.isInteger(run.api) ||
        !digest.test(run.build?.apkSha256 ?? '') || !digest.test(run.build?.testApkSha256 ?? '') ||
        !Array.isArray(run.completedStages) || !Array.isArray(run.completedChecks) || !run.completedChecks.length) {
      problems.push('Android-tier run lacks device, build or completed-stage identity.');
    }
  }
  /** @param {AndroidRun} run */
  const completeCore = (run) => run?.kind === 'core' && ANDROID_CORE_STAGES.every((stage) => run?.completedStages?.includes(stage));
  if (!runs.some((run) => run?.api === 26 && completeCore(run))) problems.push('Android tier requires completed API 26 core stages.');
  if (!runs.some((run) => run?.api >= 35 && run.nativeOnly === false && completeCore(run) && run.completedStages.includes('archive-recovery'))) {
    problems.push('Android tier requires completed current-Android core stages and Archive recovery.');
  }
  for (const [key, stage] of [['lockedProcessDeath', 'locked-process-death'], ['installedUpgrade', 'installed-upgrade']]) {
    const optional = data.optionalStages?.[key];
    const completed = runs.some((run) => run?.completedStages?.includes(stage));
    if (optional !== (completed ? 'completed' : null)) {
      problems.push(`Android-tier optionalStages.${key} must be explicitly absent or backed by a completed stage.`);
    }
  }
  return problems;
}

/** @param {string} cwd @param {AndroidStart} start @param {AndroidRun[]} runs */
export function writeAndroidTierEvidence(cwd, start, runs) {
  if (git(cwd, 'rev-parse', 'HEAD') !== start.revision || git(cwd, 'status', '--porcelain')) {
    throw new Error('Android source changed during the run; no passing evidence was written.');
  }
  if (!runs.length || runs.some((run) => !run.completedStages.length || !run.completedChecks.length)) {
    throw new Error('Android run has no completed stages; no passing evidence was written.');
  }
  const path = join(cwd, RECORD);
  const record = JSON.parse(readFileSync(path, 'utf8'));
  const previous = record.androidTier;
  /** @type {AndroidRun[]} */
  const currentRuns = previous && sameAndroidSource(cwd, previous.revision) ? previous.runs ?? [] : [];
  const passedAt = new Date().toISOString();
  const completedRuns = runs.map((run) => ({ ...run, ...start, passedAt }));
  const merged = [...currentRuns.filter((old) => !runs.some((run) => run.avd === old.avd && run.kind === old.kind)), ...completedRuns];
  record.androidTier = {
    ...start, passedAt, runs: merged,
    optionalStages: {
      lockedProcessDeath: merged.some((run) => run.completedStages.includes('locked-process-death')) ? 'completed' : null,
      installedUpgrade: merged.some((run) => run.completedStages.includes('installed-upgrade')) ? 'completed' : null
    }
  };
  if (!sameAndroidSource(cwd, record.candidateRevision)) record.candidateRevision = start.revision;
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`);
  renameSync(temporary, path);
  return record.androidTier;
}
