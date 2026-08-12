import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PREFERENCE_DEFAULTS } from '../prefs/catalogue.ts';
import type { ArchiveSnapshot } from '../journal/archive.ts';
import { runAndroidAutoExport } from './android-auto-export.ts';
import { androidAutoExport } from './android-auto-export-bridge.ts';

vi.mock('$lib/platform', () => ({ isAndroid: () => true }));
vi.mock('./android-auto-export-bridge.ts', () => ({
  androidAutoExport: {
    status: vi.fn(),
    pickDestination: vi.fn(),
    configure: vi.fn(),
    writeBackup: vi.fn()
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
    reminders: []
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
      lastFailureReason: null
    });
    vi.mocked(androidAutoExport.writeBackup).mockResolvedValue({ writtenAt: 12345 });
    vi.mocked(androidAutoExport.configure).mockResolvedValue({
      enabled: false,
      schedule: 'weekly',
      destinationUri: null,
      destinationLabel: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastFailureReason: 'destination-revoked'
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
      lastFailureReason: null
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
});
