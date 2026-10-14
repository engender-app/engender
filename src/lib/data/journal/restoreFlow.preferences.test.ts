import { beforeEach, expect, test, vi } from 'vitest';

const { replace, merge, opened, refreshPreferences, activateLanguage } = vi.hoisted(() => ({
  replace: vi.fn(),
  merge: vi.fn(),
  opened: vi.fn(),
  refreshPreferences: vi.fn(),
  activateLanguage: vi.fn()
}));
vi.mock('../archive/pack', () => ({ openArchive: opened }));
vi.mock('../live/journal.svelte', () => ({ journal: { archive: { replace, merge } } }));
vi.mock('../prefs/store.svelte', () => ({ refreshPreferences, activateLanguagePreference: activateLanguage }));

import { runRestore } from './restoreFlow';

beforeEach(() => {
  vi.clearAllMocks();
  replace.mockResolvedValue(undefined);
  merge.mockResolvedValue(undefined);
  refreshPreferences.mockResolvedValue(true);
});

test('reports success after replacing a v2 payload without portable preferences', async () => {
  const journal = { entries: [], dimensions: [], presets: [], tagGroups: [], milestones: [] };
  opened.mockResolvedValue({ payload: { journal, files: [] }, files: (async function* () {})() });
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const result = await runRestore({ name: 'old-v2.ttbackup', bytes: async function* () {} }, 'password', 'replace', () => {});

    expect(replace).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true });
    expect(replace.mock.calls[0][0]).toHaveProperty('preferences', undefined);
    expect(refreshPreferences).toHaveBeenCalledTimes(1);
    expect(activateLanguage).toHaveBeenCalledTimes(1);
    expect(replace.mock.invocationCallOrder[0]).toBeLessThan(refreshPreferences.mock.invocationCallOrder[0]);
    expect(refreshPreferences.mock.invocationCallOrder[0]).toBeLessThan(activateLanguage.mock.invocationCallOrder[0]);
  } finally {
    logged.mockRestore();
  }
});

test('a failed Replace never refreshes preferences or activates the incoming language', async () => {
  opened.mockResolvedValue({ payload: { journal: {}, preferences: { language: 'pl' }, files: [] }, files: (async function* () {})() });
  replace.mockRejectedValue(new Error('synthetic row refusal'));
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    expect((await runRestore({ name: 'refused.ttbackup', bytes: async function* () {} }, 'password', 'replace', () => {})).ok).toBe(false);
    expect(refreshPreferences).not.toHaveBeenCalled();
    expect(activateLanguage).not.toHaveBeenCalled();
  } finally { logged.mockRestore(); }
});

test('a newer lock or attachment prevents stale locale publication after Replace', async () => {
  opened.mockResolvedValue({ payload: { journal: {}, preferences: { language: 'pl' }, files: [] }, files: (async function* () {})() });
  refreshPreferences.mockResolvedValue(false);
  await expect(runRestore({ name: 'superseded.ttbackup', bytes: async function* () {} }, 'password', 'replace', () => {})).resolves.toEqual({ ok: true });
  expect(activateLanguage).not.toHaveBeenCalled();
});

test('Merge keeps the destination preference and locale path untouched', async () => {
  opened.mockResolvedValue({ payload: { journal: {}, preferences: { language: 'pl' }, files: [] }, files: (async function* () {})() });
  await expect(runRestore({ name: 'merge.ttbackup', bytes: async function* () {} }, 'password', 'merge', () => {})).resolves.toEqual({ ok: true });
  expect(merge).toHaveBeenCalledTimes(1);
  expect(refreshPreferences).not.toHaveBeenCalled();
  expect(activateLanguage).not.toHaveBeenCalled();
});
