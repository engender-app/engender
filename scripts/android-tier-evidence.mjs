import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** @typedef {{revision: string, startedAt: string}} AndroidStart */
/** @typedef {{sha256: string, sourceRevision: string, versionName: string, versionCode: number, packageId: string, patch: null | 'loss-migration-measurement' | 'loss-migration'}} UpgradeApk */
/** @typedef {{apkSha256: string, testApkSha256?: string, upgradeApks?: {previous: UpgradeApk, healthy: UpgradeApk, rowDeleting: UpgradeApk, failing: UpgradeApk}}} AndroidBuild */
/** @typedef {{avd: string, serial: string, api: number, nativeOnly: boolean, kind: string, completedStages: string[], completedChecks: string[], build: AndroidBuild, offlineOcr?: {package: string, build: {apkSha256: string, testApkSha256: string}}, revision?: string, startedAt?: string, passedAt?: string}} AndroidRun */
/** @typedef {{revision: string, startedAt: string, passedAt: string, runs: AndroidRun[], optionalStages: Record<string, string | null>}} AndroidEvidence */

export const ANDROID_CORE_STAGES = ['instrumentation', 'pin-wait', 'native-backup'];
const RECORD = 'scripts/progressive-release-record.json';
const sha = /^[a-f0-9]{40}$/;
const digest = /^[a-f0-9]{64}$/;
/** @param {string} cwd @param {...string} args */
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** @param {AndroidBuild} build @param {string} revision @param {string} cwd */
export function installedUpgradeBuildProblems(build, revision, cwd) {
  const apks = build?.upgradeApks;
  if (!apks) return ['Installed-upgrade evidence lacks complete four-APK provenance.'];
  const roles = [apks.previous, apks.healthy, apks.rowDeleting, apks.failing];
  if (roles.some((apk) => !apk || !digest.test(apk.sha256 ?? '') || !sha.test(apk.sourceRevision ?? '') ||
      typeof apk.versionName !== 'string' || !apk.versionName.trim() || !Number.isInteger(apk.versionCode) ||
      apk.versionCode < 1 || apk.versionCode > 2147483647 || apk.packageId !== 'dev.engender.app.test.upgrade40') ||
      new Set(roles.map((apk) => apk.sha256)).size !== 4) {
    return ['Installed-upgrade evidence lacks complete four-APK provenance.'];
  }
  const problems = [];
  let released;
  try { released = git(cwd, 'rev-parse', 'v1.0.0-rc.1^{commit}'); } catch {}
  if (apks.previous.sourceRevision !== released || apks.previous.versionName !== '1.0.0-rc.1') {
    problems.push('Installed-upgrade previous APK does not name the released rc.1 source.');
  }
  if (apks.healthy.sha256 !== build.apkSha256 || apks.healthy.sourceRevision !== revision ||
      apks.rowDeleting.sourceRevision !== revision || apks.failing.sourceRevision !== revision) {
    problems.push('Installed-upgrade target hash or derivative source differs from the tested candidate.');
  }
  if (apks.previous.patch !== null || apks.healthy.patch !== null ||
      apks.rowDeleting.patch !== 'loss-migration-measurement' || apks.failing.patch !== 'loss-migration') {
    problems.push('Installed-upgrade APK patch roles are missing or mismatched.');
  }
  if (apks.healthy.versionCode <= apks.previous.versionCode ||
      apks.rowDeleting.versionCode < apks.healthy.versionCode || apks.failing.versionCode < apks.healthy.versionCode) {
    problems.push('Installed-upgrade APK version codes do not describe an upgrade.');
  }
  return problems;
}

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
        !digest.test(run.build?.apkSha256 ?? '') || (run.kind !== 'installed-upgrade' && !digest.test(run.build?.testApkSha256 ?? '')) ||
        !Array.isArray(run.completedStages) || !Array.isArray(run.completedChecks) || !run.completedChecks.length) {
      problems.push('Android-tier run lacks device, build or completed-stage identity.');
    }
    const upgradeStage = Array.isArray(run?.completedStages) && run.completedStages.includes('installed-upgrade');
    if (run?.kind === 'installed-upgrade' || upgradeStage) {
      if (run?.kind !== 'installed-upgrade' || !upgradeStage) {
        problems.push('Installed-upgrade evidence needs its own run kind and completed stage.');
      }
      problems.push(...installedUpgradeBuildProblems(run?.build, run?.revision ?? '', cwd));
    }
  }
  /** @param {AndroidRun} run */
  const completeCore = (run) => run?.kind === 'core' && ANDROID_CORE_STAGES.every((stage) => run?.completedStages?.includes(stage));
  if (!runs.some((run) => run?.api === 26 && completeCore(run))) problems.push('Android tier requires completed API 26 core stages.');
  if (!runs.some((run) => run?.api >= 35 && run.nativeOnly === false && completeCore(run) && run.completedStages.includes('archive-recovery'))) {
    problems.push('Android tier requires completed current-Android core stages and Archive recovery.');
  }
  if (!runs.some((run) => run?.api >= 35 && completeCore(run) &&
      run.completedStages.includes('offline-ocr') && /^dev\.engender\.app\.test\.[a-z0-9]+$/.test(run.offlineOcr?.package ?? '') &&
      digest.test(run.offlineOcr?.build?.apkSha256 ?? '') && digest.test(run.offlineOcr?.build?.testApkSha256 ?? ''))) {
    problems.push('Android tier requires fresh isolated offline OCR with APK identity on current Android.');
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
  for (const run of runs) {
    if (run.kind === 'installed-upgrade' || run.completedStages.includes('installed-upgrade')) {
      const problems = installedUpgradeBuildProblems(run.build, start.revision, cwd);
      if (run.kind !== 'installed-upgrade' || !run.completedStages.includes('installed-upgrade') || problems.length) {
        throw new Error('Installed-upgrade evidence is incomplete; no passing evidence was written.');
      }
    }
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
