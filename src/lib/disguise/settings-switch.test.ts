/* Settings' disguise switch, and the order it has to keep on Android
   (last-audit UI ticket 02).

   Flipping disguise swaps the launcher alias, and DisguisePlugin kills the
   process the moment the alias flips. The alias is requested by
   +layout.svelte, which reads the projected `prefs.disguise` and hands it
   to startAndroidPlatformSync, whose start calls setLauncherIdentity. An
   effect re-runs only when what it read changes, so the alias is requested
   exactly when the projection moves. If it moves before SQLite has the
   value, the process dies with the write still out, the next boot reads
   the old answer and swaps the alias straight back.

   Two halves, because only one of them is behaviour. The store's durable
   write is called here for real, with a SQLite stand-in that answers when
   the test says so. That the Settings switch is the one calling it is a
   question about source, and a grep is what can answer it - the same one
   gates-surfaces.test.ts asks of onboarding.

   The store is a runes module and this tier has no Svelte compiler, so
   `$state` is shimmed as a plain value. Nothing below needs reactivity:
   the layout effect's trigger is the projected value, and the test reads
   that value directly at each step. */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  (globalThis as { $state?: <T>(value: T) => T }).$state = (value) => value;
});
vi.mock('$lib/paraglide/runtime', () => ({ getLocale: () => 'en', setLocale: () => {} }));

import { PREFERENCE_DEFAULTS, type PreferenceValues } from '../data/prefs/catalogue';
import type { Preferences } from '../data/prefs/preferences';
import { attachPreferences, prefs, setPreferenceDurably } from '../data/prefs/store.svelte';

const root = fileURLToPath(new URL('../../..', import.meta.url));

/** A preference table whose writes land only when `land` is called. */
function slowTable(initial: Partial<PreferenceValues>) {
  const stored: PreferenceValues = { ...PREFERENCE_DEFAULTS, ...initial };
  const pending: Array<{ settle: () => void; fail: (error: Error) => void }> = [];
  const table: Preferences = {
    all: () => ({ ...stored }),
    get: (key) => stored[key],
    set: (key, value) =>
      new Promise<void>((resolve, reject) => {
        pending.push({
          settle: () => {
            stored[key] = value;
            resolve();
          },
          fail: reject
        });
      }),
    prepareCommittedValues: () => () => {},
    openedEmpty: () => false
  };
  return {
    table,
    stored,
    pendingWrites: () => pending.length,
    land: () => pending.shift()!.settle(),
    refuse: () => pending.shift()!.fail(new Error('synthetic write refusal'))
  };
}

/** Lets every queued microtask run, so an alias request that was going to
    happen early has had every chance to. */
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

/** What +layout.svelte would ask the launcher for right now: an alias
    request whenever the projection differs from the last one it acted on. */
function launcher(initial: boolean) {
  const requests: boolean[] = [];
  let last = initial;
  return {
    requests,
    observe() {
      if (prefs.disguise !== last) {
        last = prefs.disguise;
        requests.push(last);
      }
    }
  };
}

describe('the Settings disguise switch', () => {
  const settings = readFileSync(root + 'src/routes/settings/+page.svelte', 'utf8');

  it('writes through the durable preference write onboarding uses, never a plain assignment', () => {
    const handler = /label=\{m\.disguise_app_title\(\)\}\s*onChange=\{([\s\S]*?)\}\s*\/>/.exec(settings)?.[1] ?? '';
    expect(handler.trim()).toBe('(v) => void setDisguise(v)');
    const setDisguise = /async function setDisguise\(on: boolean\) \{([\s\S]*?)\n  \}/.exec(settings)?.[1] ?? '';
    expect(setDisguise.split('\n').map((line) => line.trim()).filter(Boolean)).toEqual([
      'disguiseAnswer = on;',
      "await setPreferenceDurably('disguise', on);",
      'if (disguiseAnswer === on) disguiseAnswer = null;'
    ]);
    expect(settings.match(/prefs\.disguise\s*=[^=]/g) ?? []).toHaveLength(0);
  });

  it('leaves the alias request to the projection, with no launcher call of its own', () => {
    /* The ordering cases below hold only while the projection is the one
       trigger. A launcher call made from anywhere else - Settings above
       all - could run ahead of the write again and still pass them. */
    const sources = (dir: string): string[] =>
      readdirSync(root + dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? sources(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]
      );
    const callers = sources('src')
      .filter((file) => /\.(ts|svelte)$/.test(file) && !file.endsWith('.test.ts'))
      .filter((file) => /\.setLauncherIdentity\(/.test(readFileSync(root + file, 'utf8')));
    expect(callers).toEqual(['src/lib/android/platform-sync.ts']);
    expect(settings).not.toContain('disguise/android-bridge');
  });
});

describe.each([
  { turning: 'on', from: false, to: true },
  { turning: 'off', from: true, to: false }
])('turning disguise $turning', ({ from, to }) => {
  let slow: ReturnType<typeof slowTable>;

  beforeEach(async () => {
    slow = slowTable({ disguise: from });
    await attachPreferences(slow.table);
  });

  it('does not ask for the launcher alias until the preference write has resolved', async () => {
    const alias = launcher(from);
    const switched = setPreferenceDurably('disguise', to);

    await settle();
    alias.observe();
    expect(slow.pendingWrites()).toBe(1);
    expect(alias.requests).toEqual([]);
    expect(prefs.disguise).toBe(from);

    slow.land();
    await switched;
    alias.observe();
    expect(slow.stored.disguise).toBe(to);
    expect(alias.requests).toEqual([to]);
  });

  it('never asks for the alias when the write is refused', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const alias = launcher(from);
      const switched = setPreferenceDurably('disguise', to);
      await settle();
      slow.refuse();
      await switched;
      alias.observe();
      expect(alias.requests).toEqual([]);
      expect(prefs.disguise).toBe(from);
      expect(logged).toHaveBeenCalledTimes(1);
    } finally {
      logged.mockRestore();
    }
  });
});
