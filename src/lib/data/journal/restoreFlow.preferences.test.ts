import { beforeEach, expect, test, vi } from 'vitest';
import { portablePreferencePatch } from '../prefs/portableShape';

const { replace, opened, applyPreferences } = vi.hoisted(() => ({
  replace: vi.fn(),
  opened: vi.fn(),
  applyPreferences: vi.fn()
}));
vi.mock('../archive/pack', () => ({ openArchive: opened }));
vi.mock('../live/journal.svelte', () => ({ journal: { archive: { replace } } }));
vi.mock('../prefs/store.svelte', () => ({ applyPortablePreferences: applyPreferences }));

import { runRestore } from './restoreFlow';

beforeEach(() => {
  vi.clearAllMocks();
  replace.mockResolvedValue(undefined);
  applyPreferences.mockImplementation(portablePreferencePatch);
});

test('reports success after replacing a v2 payload without portable preferences', async () => {
  const journal = { entries: [], dimensions: [], presets: [], tagGroups: [], milestones: [] };
  opened.mockResolvedValue({ payload: { journal, files: [] }, files: (async function* () {})() });
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const result = await runRestore({ name: 'old-v2.ttbackup', bytes: async function* () {} }, 'password', 'replace', () => {});

    expect(replace).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true });
    expect(applyPreferences).toHaveReturnedWith({ cycleTrackingChoice: null });
  } finally {
    logged.mockRestore();
  }
});
