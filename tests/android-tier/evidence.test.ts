import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { beginAndroidTier, writeAndroidTierEvidence, androidTierProblems } from '../../scripts/android-tier-evidence.mjs';
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
