import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { beginAndroidTier, writeAndroidTierEvidence, androidTierProblems, androidBuildIdentity } from '../../scripts/android-tier-evidence.mjs';
import { androidTierFixture } from '../fixtures/android-tier-evidence';

let root: string;
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'android-tier-evidence-'));
  git('init', '-q');
  git('config', 'user.name', 'Evidence test');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  mkdirSync(join(root, 'scripts'));
  writeFileSync(join(root, 'scripts/progressive-release-record.json'), '{"candidateRevision":""}');
  writeFileSync(join(root, 'source.txt'), 'candidate');
  git('add', '.');
  git('commit', '-qm', 'Test candidate');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

it('hashes the selected optimized APK pair without borrowing the debug artifacts', () => {
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  for (const variant of ['debug', 'r8Instrumented'] as const) {
    for (const test of [false, true]) {
      const directory = join(root, 'android/app/build/outputs/apk', test ? 'androidTest' : '', variant);
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, `app-${variant}${test ? '-androidTest' : ''}.apk`), `${variant}:${test}`);
    }
    expect(androidBuildIdentity(root, variant)).toEqual({ variant,
      apkSha256: hash(`${variant}:false`), testApkSha256: hash(`${variant}:true`) });
  }
  expect(androidBuildIdentity(root).variant).toBe('debug');
  rmSync(join(root, 'android/app/build/outputs/apk/r8Instrumented/app-r8Instrumented.apk'));
  expect(() => androidBuildIdentity(root, 'r8Instrumented')).toThrow();
});

it('refuses a dirty start, changed source and an empty completed run without writing evidence', () => {
  const start = beginAndroidTier(root);
  writeFileSync(join(root, 'source.txt'), 'dirty');
  expect(() => beginAndroidTier(root)).toThrow('clean working tree');
  expect(() => writeAndroidTierEvidence(root, start, androidTierFixture(start.revision).runs)).toThrow('source changed');
  git('checkout', '--', 'source.txt');
  expect(() => writeAndroidTierEvidence(root, start, [])).toThrow('no completed stages');
  expect(JSON.parse(readFileSync(join(root, 'scripts/progressive-release-record.json'), 'utf8')).androidTier).toBeUndefined();
});

it('records exact device/build/stage identity and accepts only a later record commit', () => {
  const start = beginAndroidTier(root);
  const runs = androidTierFixture(start.revision).runs;
  const evidence = writeAndroidTierEvidence(root, start, runs);
  expect(evidence.runs).toEqual(runs.map((run) => ({ ...run, ...start, passedAt: evidence.passedAt })));
  expect(evidence.optionalStages).toEqual({ installedUpgrade: null, lockedProcessDeath: null });
  git('add', '.');
  git('commit', '-qm', 'Record fixture evidence');
  expect(androidTierProblems(evidence, start.revision, root)).toEqual([]);
  writeFileSync(join(root, 'source.txt'), 'new source');
  git('add', '.');
  git('commit', '-qm', 'Change source');
  expect(androidTierProblems(evidence, start.revision, root)).toContain('Android-tier revision differs from candidate source.');
});

it('keeps optional stages absent until actual completed stage records exist', () => {
  const start = beginAndroidTier(root);
  const evidence = writeAndroidTierEvidence(root, start, androidTierFixture(start.revision).runs);
  evidence.optionalStages.lockedProcessDeath = 'completed';
  expect(androidTierProblems(evidence, start.revision, root)).toContain('Android-tier optionalStages.lockedProcessDeath must be explicitly absent or backed by a completed stage.');
  evidence.optionalStages.lockedProcessDeath = null;
  evidence.runs[1].completedStages = ['locked-process-death'];
  evidence.runs[1].kind = 'locked-process-death';
  expect(androidTierProblems(evidence, start.revision, root)).toContain('Android tier requires completed current-Android core stages and Archive recovery.');
});

it('preserves earlier core run timestamps across a record-only optional follow-up', () => {
  const start = beginAndroidTier(root);
  const first = writeAndroidTierEvidence(root, start, androidTierFixture(start.revision).runs);
  git('add', '.');
  git('commit', '-qm', 'Record fixture core evidence');
  const followup = beginAndroidTier(root);
  const optional = { ...androidTierFixture(followup.revision).runs[1], kind: 'locked-process-death', completedStages: ['locked-process-death'] };
  const merged = writeAndroidTierEvidence(root, followup, [optional]);
  expect(merged.runs.slice(0, 2)).toEqual(first.runs);
  expect(merged.runs[2].revision).toBe(followup.revision);
  expect(merged.runs[2].startedAt).toBe(followup.startedAt);
  git('add', '.');
  git('commit', '-qm', 'Record fixture optional evidence');
  expect(androidTierProblems(merged, start.revision, root)).toEqual([]);
});

it('refuses current core evidence without fresh isolated offline OCR identity', () => {
  const start = beginAndroidTier(root);
  const evidence = androidTierFixture(start.revision);
  evidence.startedAt = start.startedAt;
  evidence.passedAt = start.startedAt;
  evidence.runs.forEach(run => { run.startedAt = start.startedAt; run.passedAt = start.startedAt; });
  evidence.runs[1].completedStages = evidence.runs[1].completedStages.filter(stage => stage !== 'offline-ocr');
  expect(androidTierProblems(evidence, start.revision, root)).toContain('Android tier requires fresh isolated offline OCR with APK identity on current Android.');
});

for (const invalid of ['before-commit', 'future', 'after-aggregate']) {
  it(`refuses ${invalid} run timestamps even with valid aggregate timestamps`, () => {
    const start = beginAndroidTier(root);
    const evidence = androidTierFixture(start.revision);
    evidence.startedAt = start.startedAt;
    evidence.passedAt = start.startedAt;
    evidence.runs.forEach(run => {
      run.startedAt = start.startedAt;
      run.passedAt = start.startedAt;
    });
    const run = evidence.runs[0];
    if (invalid === 'before-commit') run.startedAt = run.passedAt = '2000-01-01T00:00:00Z';
    else if (invalid === 'future') run.passedAt = new Date(Date.now() + 60_000).toISOString();
    else {
      evidence.passedAt = new Date(Date.now() - 1).toISOString();
      evidence.startedAt = evidence.passedAt;
      run.passedAt = new Date().toISOString();
    }
    expect(androidTierProblems(evidence, start.revision, root)).toContain('Android-tier run lacks matching source revision or completion timestamps.');
  });
}
