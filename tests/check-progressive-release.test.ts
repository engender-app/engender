import { readFileSync } from 'node:fs';
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

describe('progressiveReleaseProblems', () => {
  it('fails malformed top-level structure', () => {
    const problems = progressiveReleaseProblems({ releaseVersion: '' }, 'stage1');
    expect(problems).toContain('releaseVersion must be a non-empty string.');
    expect(problems).toContain('stages must be an object.');
  });

  it('passes a record that satisfies every stage and channel gate', () => {
    expect(progressiveReleaseProblems(fullRecord(), 'stable')).toEqual([]);
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
