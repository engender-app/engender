/* A language picked on the welcome, before there is a journal to write it
   to (pre-release-human ticket 19).

   setLocale() reloads the page, and a preference written before SQLite
   opens is held in memory until the journal attaches - so the reload threw
   the choice away. Paraglide's own copy survived it, which made the screen
   look right, and then the journal attached with `language: 'system'`,
   activateLanguagePreference() resolved that against a Polish browser and
   reloaded setup back into Polish at the access-mode step. These run the
   store for real across a module reload, with paraglide and localStorage
   stood in for. `$state` is shimmed as a plain value, as in
   settings-switch.test.ts: nothing here needs reactivity. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  (globalThis as { $state?: <T>(value: T) => T }).$state = (value) => value;
});

const paraglide = vi.hoisted(() => ({ locale: 'pl', setLocale: vi.fn() }));
vi.mock('$lib/paraglide/runtime', () => ({
  getLocale: () => paraglide.locale,
  setLocale: (locale: string) => {
    paraglide.setLocale(locale);
    // Paraglide keeps its own copy in localStorage, which is what survives.
    paraglide.locale = locale;
  }
}));

import { PREFERENCE_DEFAULTS, type PreferenceKey, type PreferenceValues } from './catalogue';
import type { Preferences } from './preferences';

type Store = typeof import('./store.svelte');

const storage = new Map<string, string>();

function fakePreferences(stored: PreferenceValues) {
  const set = vi.fn(async (key: PreferenceKey, value: unknown) => {
    (stored as unknown as Record<string, unknown>)[key] = value;
  });
  const preferences = { all: () => ({ ...stored }), get: (key: PreferenceKey) => stored[key], set } as unknown as Preferences;
  return { preferences, set };
}

/** A fresh copy of the store, which is what a reload gives the page. */
async function boot(): Promise<Store> {
  vi.resetModules();
  const store = await import('./store.svelte');
  // Boot step 1: the mirror's boot set, before SQLite has opened.
  store.applyCachedBootPreferences({});
  return store;
}

beforeEach(() => {
  storage.clear();
  paraglide.locale = 'pl';
  paraglide.setLocale.mockClear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key)
  });
  vi.stubGlobal('navigator', { language: 'pl-PL' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a language chosen before the journal opens', () => {
  it('survives the reload and is the language the journal stores', async () => {
    const before = await boot();
    await before.chooseLanguage('en');
    expect(paraglide.setLocale).toHaveBeenCalledWith('en');

    const after = await boot();
    expect(after.prefs.language).toBe('en');

    const { preferences, set } = fakePreferences({ ...PREFERENCE_DEFAULTS });
    await after.attachPreferences(preferences);
    await after.flushPreferences();
    expect(set).toHaveBeenCalledWith('language', 'en');
    expect(after.prefs.language).toBe('en');

    // What boot does next on a Polish browser: nothing, since English holds.
    paraglide.setLocale.mockClear();
    after.activateLanguagePreference();
    expect(paraglide.setLocale).not.toHaveBeenCalled();
  });

  it('is let go of once the journal has it, so a later boot reads the journal', async () => {
    const before = await boot();
    await before.chooseLanguage('en');
    const after = await boot();
    await after.attachPreferences(fakePreferences({ ...PREFERENCE_DEFAULTS }).preferences);
    await after.flushPreferences();

    const later = await boot();
    expect(later.prefs.language).toBe(PREFERENCE_DEFAULTS.language);
  });

  it('writes straight through and then switches once a journal is open', async () => {
    const store = await boot();
    const { preferences, set } = fakePreferences({ ...PREFERENCE_DEFAULTS });
    await store.attachPreferences(preferences);
    await store.chooseLanguage('en');
    expect(set).toHaveBeenCalledWith('language', 'en');
    expect(set.mock.invocationCallOrder[0]).toBeLessThan(paraglide.setLocale.mock.invocationCallOrder[0]);
    expect(paraglide.setLocale).toHaveBeenCalledWith('en');
  });
});
