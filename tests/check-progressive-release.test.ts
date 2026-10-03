import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { progressiveReleaseProblems } from '../scripts/check-progressive-release.mjs';
import {
  CHANNEL_STAGE_GATE,
  RELEASE_MATRIX_CHECKS,
  STAGE_EVIDENCE_KEYS,
  STAGE_ORDER
} from '../scripts/progressive-release-gate-contract.mjs';

function baseMatrix(ranAt = '2026-08-13T09:00:00Z') {
  return {
    ranAt,
    checks: {
      update: true,
      migration: true,
      encryptionConversion: true,
      archiveRoundTrip: true,
      scheduledBackup: true,
      rollback: true
    }
  };
}

function fullRecord() {
  return {
    releaseVersion: '2.2.0',
    stages: {
      stage1: {
        passedAt: '2026-08-13T10:00:00Z',
        releaseMatrix: baseMatrix('2026-08-13T09:00:00Z'),
        evidence: {
          hostedWebBeta: true,
          landingSiteLive: true,
          truthfulAvailabilityLabels: true
        }
      },
      stage2: {
        passedAt: '2026-08-14T10:00:00Z',
        releaseMatrix: baseMatrix('2026-08-14T09:00:00Z'),
        evidence: {
          androidApi26: true,
          androidCurrent: true,
          aggressiveBackgroundDevice: true
        }
      },
      stage3: {
        passedAt: '2026-08-15T10:00:00Z',
        releaseMatrix: baseMatrix('2026-08-15T09:00:00Z'),
        evidence: {
          playOpenTesting: true,
          signedGithubReleaseApk: true
        }
      },
      stage4: {
        passedAt: '2026-08-16T10:00:00Z',
        releaseMatrix: baseMatrix('2026-08-16T09:00:00Z'),
        evidence: {
          fdroidSubmission: true,
          fdroidRebuildPassed: true,
          fdroidDependencyCheckPassed: true
        }
      },
      stable: {
        passedAt: '2026-08-17T10:00:00Z',
        releaseMatrix: baseMatrix('2026-08-17T09:00:00Z'),
        evidence: {
          update: true,
          migration: true,
          encryptionConversion: true,
          archiveRoundTrip: true,
          scheduledBackup: true,
          rollback: true
        }
      }
    },
    channels: {
      web: { state: 'live', switchedAt: '2026-08-13T10:30:00Z' },
      play: { state: 'live', switchedAt: '2026-08-15T10:30:00Z' },
      obtainium: { state: 'live', switchedAt: '2026-08-15T10:31:00Z' },
      fdroid: { state: 'live', switchedAt: '2026-08-16T10:30:00Z' }
    }
  };
}

function progressiveTemplate() {
  return JSON.parse(readFileSync('scripts/progressive-release-record.template.json', 'utf8'));
}

function pendingRecord() {
  const record = fullRecord();
  for (const stage of STAGE_ORDER as Array<keyof typeof record.stages>) {
    record.stages[stage].passedAt = '';
    record.stages[stage].releaseMatrix.ranAt = '';
    for (const check of RELEASE_MATRIX_CHECKS) record.stages[stage].releaseMatrix.checks[check as keyof ReturnType<typeof baseMatrix>['checks']] = false;
    for (const key of Object.keys(record.stages[stage].evidence)) (record.stages[stage].evidence as Record<string, boolean>)[key] = false;
  }
  for (const channel of ['web', 'play', 'obtainium', 'fdroid'] as const) {
    record.channels[channel] = { state: 'label-only', switchedAt: '' };
  }
  return record;
}

describe('progressiveReleaseProblems', () => {
  it('fails malformed top-level structure', () => {
    const problems = progressiveReleaseProblems({ releaseVersion: '' }, 'stage1');
    expect(problems).toContain('releaseVersion must be a non-empty string.');
    expect(problems).toContain('stages must be an object.');
  });

  it('passes a record that satisfies every stage and channel gate', () => {
    expect(progressiveReleaseProblems(fullRecord(), 'stable')).toEqual([]);
  });

  it('defaults to the highest claimed stage while later stages remain pending', () => {
    const released = fullRecord();
    const record = pendingRecord();
    record.stages.stage1 = released.stages.stage1;
    record.channels.web = released.channels.web;
    expect(progressiveReleaseProblems(record)).toEqual([]);
  });

  it('rejects a missing stage in an unreleased record rather than passing an empty baseline', () => {
    const record = { releaseVersion: '1.0.0', stages: {}, channels: {
      web: { state: 'label-only' }, play: { state: 'label-only' },
      obtainium: { state: 'label-only' }, fdroid: { state: 'label-only' }
    } };
    expect(progressiveReleaseProblems(record)).toContain('Missing stage record: stage1');
  });

  it('reads the tracked default record on a clone without local docs', () => {
    const root = mkdtempSync(join(tmpdir(), 'progressive-release-'));
    try {
      mkdirSync(join(root, 'scripts'));
      writeFileSync(join(root, 'scripts/progressive-release-record.json'), JSON.stringify(pendingRecord()));
      const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/check-progressive-release.mjs', import.meta.url))], { cwd: root, encoding: 'utf8' });
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('PASS progressive release record is valid through unreleased.');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('validates every pending exercise field even before any stage is claimed', () => {
    const record = pendingRecord();
    (record.stages.stage2.evidence as Record<string, unknown>).androidApi26 = 'pending';
    expect(progressiveReleaseProblems(record)).toContain('stage2.evidence.androidApi26 must be a boolean.');
  });

  it('requires the whole stage when only one piece of its evidence is claimed', () => {
    const record = pendingRecord();
    record.stages.stage3.evidence.signedGithubReleaseApk = true;
    const problems = progressiveReleaseProblems(record);
    expect(problems).toContain('stage3.passedAt must be an ISO timestamp.');
    expect(problems).toContain('stage3.releaseMatrix.checks.rollback must be true.');
    expect(problems).toContain('stage1.evidence.hostedWebBeta must be true.');
  });

  it('does not hide an invalid stage timestamp by falling back to an earlier stage', () => {
    const record = pendingRecord();
    record.stages.stage4.passedAt = 'yesterday';
    expect(progressiveReleaseProblems(record)).toContain('stage4.passedAt must be an ISO timestamp.');
    expect(progressiveReleaseProblems(record)).toContain('stage4.evidence.fdroidRebuildPassed must be true.');
  });

  it('infers a live channel claim even if its stage has no passed timestamp', () => {
    const record = pendingRecord();
    record.channels.play = { state: 'live', switchedAt: '2026-08-15T10:30:00Z' };
    expect(progressiveReleaseProblems(record)).toContain('stage3.evidence.playOpenTesting must be true.');
  });

  it('keeps explicit readiness checks strict for an unreleased record', () => {
    expect(progressiveReleaseProblems(pendingRecord(), 'stage1')).toContain('stage1.passedAt must be an ISO timestamp.');
    expect(progressiveReleaseProblems(pendingRecord(), 'stable')).toContain('stable.evidence.rollback must be true.');
  });

  it('still defaults to stable when stable is claimed and fails incomplete evidence', () => {
    const record = fullRecord();
    record.stages.stable.evidence.rollback = false;
    expect(progressiveReleaseProblems(record)).toContain('stable.evidence.rollback must be true.');
  });

  it('fails when the release matrix did not pass before a stage', () => {
    const record = fullRecord();
    record.stages.stage2.releaseMatrix.checks.rollback = false;
    const problems = progressiveReleaseProblems(record, 'stage2');
    expect(problems.some((p) => p.includes('stage2.releaseMatrix.checks.rollback'))).toBe(true);
  });

  it('fails when a channel is live before its stage gate', () => {
    const record = fullRecord();
    record.channels.play = { state: 'live', switchedAt: '2026-08-13T10:40:00Z' };
    const problems = progressiveReleaseProblems(record, 'stage2');
    expect(problems.some((p) => p.includes("channels.play.state cannot be 'live' before stage3"))).toBe(true);
  });

  it('fails when a live channel switched before the stage passed', () => {
    const record = fullRecord();
    record.channels.fdroid = { state: 'live', switchedAt: '2026-08-16T09:30:00Z' };
    const problems = progressiveReleaseProblems(record, 'stage4');
    expect(problems.some((p) => p.includes('channels.fdroid.switchedAt must be at or after stage4.passedAt'))).toBe(true);
  });

  it('fails stable gate when exercise evidence is missing', () => {
    const record = fullRecord();
    record.stages.stable.evidence.archiveRoundTrip = false;
    const problems = progressiveReleaseProblems(record, 'stable');
    expect(problems.some((p) => p.includes('stable.evidence.archiveRoundTrip'))).toBe(true);
  });

  it('fails non-ISO timestamps and invalid channel state', () => {
    const record: any = fullRecord();
    record.stages.stage1.passedAt = 'yesterday';
    record.channels.web = { state: 'open' };
    const problems = progressiveReleaseProblems(record, 'stage1');
    expect(problems.some((p) => p.includes('stage1.passedAt must be an ISO timestamp'))).toBe(true);
    expect(problems.some((p) => p.includes("channels.web.state must be 'label-only' or 'live'"))).toBe(true);
  });

  it('keeps template stages, checks, evidence keys, and channel gates aligned with contract', () => {
    const template = progressiveTemplate();
    expect(Object.keys(template.stages)).toEqual(STAGE_ORDER);

    for (const stage of STAGE_ORDER as Array<keyof typeof STAGE_EVIDENCE_KEYS>) {
      const stageChecks = Object.keys(template.stages[stage].releaseMatrix.checks);
      const stageEvidence = Object.keys(template.stages[stage].evidence);

      expect(stageChecks).toEqual(RELEASE_MATRIX_CHECKS);
      expect(stageEvidence).toEqual(STAGE_EVIDENCE_KEYS[stage]);
    }

    expect(Object.keys(template.channels)).toEqual(Object.keys(CHANNEL_STAGE_GATE));
  });

  it('accepts the template as valid through stable', () => {
    expect(progressiveReleaseProblems(progressiveTemplate(), 'stable')).toEqual([]);
  });
});
