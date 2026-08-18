import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PREFERENCE_DEFAULTS } from '../prefs/catalogue.ts';
import type { ArchiveSnapshot } from '../journal/archive.ts';
import { isDue, nextDueAt, runAndroidAutoExport } from './android-auto-export.ts';
import { androidAutoExport } from './android-auto-export-bridge.ts';

vi.mock('$lib/platform', () => ({ isAndroid: () => true }));
vi.mock('./android-auto-export-bridge.ts', () => ({
  androidAutoExport: {
    status: vi.fn(),
    pickDestination: vi.fn(),
    configure: vi.fn(),
    writeBackup: vi.fn(),
    setPassword: vi.fn(),
    revealPassword: vi.fn(),
    clearPassword: vi.fn(),
    notifyFailure: vi.fn()
  }
}));

const snapshot: ArchiveSnapshot = {
  journal: {
    dimensions: [],
    presets: [],
    tagGroups: [],
    entries: [],
    milestones: [],
    labResults: [],
    measurements: [],
    sideEffects: [],
    personalEffects: [],
    hairStages: [],
    hairPhotos: [],
    reminders: [],
    tallyEvents: [],
    regimenEpisodes: [],
    doubtEntries: [],
    counterevidenceSnapshots: [],
    doseEvents: [],
    doseSchedules: [],
    dosePauses: [],
    medicationStock: []
  },
  files: [],
  readFile: async () => {
    throw new Error('no files');
  }
};

describe('runAndroidAutoExport', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(androidAutoExport.status).mockResolvedValue({
      enabled: true,
      schedule: 'weekly',
      destinationUri: 'content://tree/backup',
      destinationLabel: 'backup',
      lastSuccessAt: null,
      lastFailureAt: null,
      lastFailureReason: null,
      hasPassword: true,
      nextDueAt: null
    });
    vi.mocked(androidAutoExport.writeBackup).mockResolvedValue({ writtenAt: 12345 });
    vi.mocked(androidAutoExport.configure).mockResolvedValue({
      enabled: false,
      schedule: 'weekly',
      destinationUri: null,
      destinationLabel: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastFailureReason: 'destination-revoked',
      hasPassword: true,
      nextDueAt: null
    });
  });

  test('records backup after a successful write', async () => {
    let recorded: number | null = null;

    const result = await runAndroidAutoExport(
      {
        snapshot,
        preferences: { ...PREFERENCE_DEFAULTS, name: 'Alicja' },
        password: 'correct horse'
      },
      {
        now: () => 17,
        recordBackup: (at) => {
          recorded = at;
        }
      }
    );

    expect(result).toEqual({ outcome: 'ok', writtenAt: 17 });
    expect(recorded).toBe(17);
    expect(androidAutoExport.writeBackup).toHaveBeenCalledTimes(1);
    expect(androidAutoExport.configure).not.toHaveBeenCalled();
    expect(androidAutoExport.notifyFailure).not.toHaveBeenCalled();
  });

  test('asks for a new destination and disables schedule when destination access is revoked', async () => {
    vi.mocked(androidAutoExport.writeBackup).mockRejectedValue(new Error('destination-revoked'));

    const result = await runAndroidAutoExport(
      {
        snapshot,
        preferences: { ...PREFERENCE_DEFAULTS, name: 'Alicja' },
        password: 'correct horse'
      },
      {
        now: () => 17,
        recordBackup: () => {
          throw new Error('must not record on failure');
        }
      }
    );

    expect(result).toEqual({ outcome: 'needs-destination' });
    expect(androidAutoExport.configure).toHaveBeenCalledWith({ enabled: false, schedule: 'weekly' });
  });

  test('returns needs-destination immediately when no destination exists', async () => {
    vi.mocked(androidAutoExport.status).mockResolvedValue({
      enabled: true,
      schedule: 'monthly',
      destinationUri: null,
      destinationLabel: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastFailureReason: null,
      hasPassword: true,
      nextDueAt: null
    });

    const result = await runAndroidAutoExport(
      {
        snapshot,
        preferences: { ...PREFERENCE_DEFAULTS, name: 'Alicja' },
        password: 'correct horse'
      },
      { recordBackup: () => {} }
    );

    expect(result).toEqual({ outcome: 'needs-destination' });
    expect(androidAutoExport.writeBackup).not.toHaveBeenCalled();
    expect(androidAutoExport.configure).toHaveBeenCalledWith({ enabled: false, schedule: 'monthly' });
  });

  test('retries once for transient verification failure', async () => {
    vi.mocked(androidAutoExport.writeBackup)
      .mockRejectedValueOnce(new Error('verification-failed'))
      .mockResolvedValueOnce({ writtenAt: 12345 });
    let recorded: number | null = null;

    const result = await runAndroidAutoExport(
      {
        snapshot,
        preferences: { ...PREFERENCE_DEFAULTS, name: 'Alicja' },
        password: 'correct horse'
      },
      {
        now: () => 17,
        recordBackup: (at) => {
          recorded = at;
        }
      }
    );

    expect(result).toEqual({ outcome: 'ok', writtenAt: 17 });
    expect(recorded).toBe(17);
    expect(androidAutoExport.writeBackup).toHaveBeenCalledTimes(2);
  });

  test('scheduled failure sends privacy-safe notification', async () => {
    vi.mocked(androidAutoExport.writeBackup).mockRejectedValue(new Error('destination-revoked'));

    const result = await runAndroidAutoExport(
      {
        snapshot,
        preferences: { ...PREFERENCE_DEFAULTS, name: 'Alicja' },
        password: 'correct horse'
      },
      {
        now: () => 17,
        recordBackup: () => {
          throw new Error('must not record on failure');
        }
      },
      'scheduled'
    );

    expect(result).toEqual({ outcome: 'needs-destination' });
    expect(androidAutoExport.notifyFailure).toHaveBeenCalledTimes(1);
  });

  test('unavailable destination disables schedule and returns needs-destination', async () => {
    vi.mocked(androidAutoExport.writeBackup).mockRejectedValue(new Error('destination-unavailable'));

    const result = await runAndroidAutoExport(
      {
        snapshot,
        preferences: { ...PREFERENCE_DEFAULTS, name: 'Alicja' },
        password: 'correct horse'
      },
      { recordBackup: () => {} }
    );

    expect(result).toEqual({ outcome: 'needs-destination' });
    expect(androidAutoExport.configure).toHaveBeenCalledWith({ enabled: false, schedule: 'weekly' });
  });

  test('destination-full returns failed and does not disable schedule', async () => {
    vi.mocked(androidAutoExport.writeBackup).mockRejectedValue(new Error('destination-full'));

    const result = await runAndroidAutoExport(
      {
        snapshot,
        preferences: { ...PREFERENCE_DEFAULTS, name: 'Alicja' },
        password: 'correct horse'
      },
      { recordBackup: () => {} }
    );

    expect(result).toEqual({ outcome: 'failed', reason: 'destination-full' });
    expect(androidAutoExport.configure).not.toHaveBeenCalled();
  });

  test('partial-write retries once and then fails if both attempts fail', async () => {
    vi.mocked(androidAutoExport.writeBackup)
      .mockRejectedValueOnce(new Error('partial-write'))
      .mockRejectedValueOnce(new Error('partial-write'));

    const result = await runAndroidAutoExport(
      {
        snapshot,
        preferences: { ...PREFERENCE_DEFAULTS, name: 'Alicja' },
        password: 'correct horse'
      },
      { recordBackup: () => {} }
    );

    expect(result).toEqual({ outcome: 'failed', reason: 'partial-write' });
    expect(androidAutoExport.writeBackup).toHaveBeenCalledTimes(2);
  });
});

test('next due time and due checks use schedule windows and required prerequisites', () => {
  const weekly = {
    enabled: true,
    destinationUri: 'content://tree/backup',
    hasPassword: true,
    schedule: 'weekly' as const,
    lastSuccessAt: 1_000
  };
  const weeklyDueAt = nextDueAt(weekly);
  expect(weeklyDueAt).toBe(1_000 + 7 * 24 * 60 * 60 * 1000);
  expect(isDue(weekly, weeklyDueAt - 1)).toBe(false);
  expect(isDue(weekly, weeklyDueAt)).toBe(true);

  const monthly = { ...weekly, schedule: 'monthly' as const, lastSuccessAt: null };
  expect(nextDueAt(monthly)).toBe(30 * 24 * 60 * 60 * 1000);
  expect(isDue({ ...monthly, destinationUri: null }, Number.MAX_SAFE_INTEGER)).toBe(false);
  expect(isDue({ ...monthly, hasPassword: false }, Number.MAX_SAFE_INTEGER)).toBe(false);
});
