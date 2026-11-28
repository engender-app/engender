import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { beginAndroidTier, writeAndroidTierEvidence, androidTierProblems, installedUpgradeBuildProblems } from '../../scripts/android-tier-evidence.mjs';
import { androidTierFixture } from '../fixtures/android-tier-evidence';

let root: string;
let previous: string;
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'installed-upgrade-evidence-'));
  git('init', '-q');
  git('config', 'user.name', 'Evidence test');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  mkdirSync(join(root, 'scripts'));
  writeFileSync(join(root, 'scripts/progressive-release-record.json'), '{"candidateRevision":""}');
  writeFileSync(join(root, 'source.txt'), 'released fixture');
  git('add', '.');
  git('commit', '-qm', 'Create released fixture');
  git('tag', 'v1.0.0-rc.1');
  previous = git('rev-parse', 'HEAD');
  writeFileSync(join(root, 'source.txt'), 'candidate fixture');
  git('add', '.');
  git('commit', '-qm', 'Create candidate fixture');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function upgrade(revision: string) {
  const apk = (hash: string, sourceRevision: string, versionName: string, versionCode: number,
    patch: null | 'loss-migration-side-effect' | 'loss-migration') => ({
      sha256: hash.repeat(64), sourceRevision, versionName, versionCode,
      packageId: 'dev.engender.app.test.upgrade40', patch
    });
  return {
    kind: 'installed-upgrade', avd: 'fixture-current', serial: 'emulator-5584', api: 35, nativeOnly: false,
    completedStages: ['installed-upgrade'], completedChecks: ['fixture upgrade and failure controls completed'],
    build: {
      apkSha256: 'c'.repeat(64),
      upgradeApks: {
        previous: apk('a', previous, '1.0.0-rc.1', 1000000501, null),
        healthy: apk('c', revision, '1.1.0-upgrade.40', 1001000740, null),
        rowDeleting: apk('d', revision, '1.1.0-upgrade.40', 1001000740, 'loss-migration-side-effect'),
        failing: apk('e', revision, '1.1.0-upgrade.40', 1001000740, 'loss-migration')
      }
    }
  };
}

it('accepts CDP-only upgrade provenance while keeping instrumentation hashes mandatory for core', () => {
  const start = beginAndroidTier(root);
  const run = upgrade(start.revision);
  expect(installedUpgradeBuildProblems(run.build, start.revision, root)).toEqual([]);
  const evidence = writeAndroidTierEvidence(root, start, [...androidTierFixture(start.revision).runs, run]);
  git('add', '.');
  git('commit', '-qm', 'Record synthetic evidence');
  expect(evidence.optionalStages.installedUpgrade).toBe('completed');
  expect(evidence.runs.at(-1)?.build.testApkSha256).toBeUndefined();
  expect(androidTierProblems(evidence, start.revision, root)).toEqual([]);
  delete evidence.runs[0].build.testApkSha256;
  expect(androidTierProblems(evidence, start.revision, root)).toContain('Android-tier run lacks device, build or completed-stage identity.');
});

it.each(['missing role', 'bad digest', 'same APK', 'wrong package', 'non-upgrade code', 'missing patch', 'wrong source', 'wrong healthy source', 'wrong released source', 'wrong target hash'])(
  'refuses %s without writing an installed-upgrade receipt', (defect) => {
    const start = beginAndroidTier(root);
    const run = upgrade(start.revision);
    const apks = run.build.upgradeApks;
    if (defect === 'missing role') delete (apks as Partial<typeof apks>).failing;
    if (defect === 'bad digest') apks.failing.sha256 = 'not-a-digest';
    if (defect === 'same APK') apks.failing.sha256 = apks.healthy.sha256;
    if (defect === 'wrong package') apks.healthy.packageId = 'dev.engender.app';
    if (defect === 'non-upgrade code') apks.healthy.versionCode = apks.previous.versionCode;
    if (defect === 'missing patch') apks.rowDeleting.patch = null;
    if (defect === 'wrong source') apks.rowDeleting.sourceRevision = previous;
    if (defect === 'wrong healthy source') apks.healthy.sourceRevision = previous;
    if (defect === 'wrong released source') apks.previous.sourceRevision = start.revision;
    if (defect === 'wrong target hash') run.build.apkSha256 = 'f'.repeat(64);
    expect(installedUpgradeBuildProblems(run.build, start.revision, root).length).toBeGreaterThan(0);
    expect(() => writeAndroidTierEvidence(root, start, [run])).toThrow('Installed-upgrade evidence is incomplete');
    expect(JSON.parse(readFileSync(join(root, 'scripts/progressive-release-record.json'), 'utf8')).androidTier).toBeUndefined();
  });

it('requires a dedicated completed upgrade run rather than an optional-stage label on core', () => {
  const start = beginAndroidTier(root);
  const run = upgrade(start.revision);
  run.kind = 'core';
  expect(() => writeAndroidTierEvidence(root, start, [run])).toThrow('Installed-upgrade evidence is incomplete');
  run.kind = 'installed-upgrade';
  run.completedStages = ['archive-recovery'];
  expect(() => writeAndroidTierEvidence(root, start, [run])).toThrow('Installed-upgrade evidence is incomplete');
});

it('keeps a completed optional upgrade insufficient for release and refuses foreign source', () => {
  const start = beginAndroidTier(root);
  const evidence = writeAndroidTierEvidence(root, start, [upgrade(start.revision)]);
  git('add', '.');
  git('commit', '-qm', 'Record optional fixture evidence');
  expect(evidence.optionalStages.installedUpgrade).toBe('completed');
  const problems = androidTierProblems(evidence, start.revision, root);
  expect(problems).toContain('Android tier requires completed API 26 core stages.');
  expect(problems).toContain('Android tier requires completed current-Android core stages and Archive recovery.');
  expect(problems).toContain('Android tier requires fresh isolated offline OCR with APK identity on current Android.');
  evidence.revision = previous;
  expect(androidTierProblems(evidence, start.revision, root)).toContain('Android-tier revision differs from candidate source.');
});
