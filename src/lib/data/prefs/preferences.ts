/* Preferences, held in SQLite's `pref` key-value table (ADR-0009).

   The factory takes its driver and returns the module (ADR-0017); there is
   no module-level current driver and nothing here imports an ambient
   handle, so a test constructs its own instance the same way boot does.

   Reads are synchronous because screens read preferences during render:
   opening loads every row once, and the in-memory copy is kept in step by
   the writes that go through here. SQLite stays authoritative - reopening
   throws the in-memory copy away and reads the table again.

   The optional cache is the small mirror outside SQLite (localStorage on
   web, Capacitor Preferences on Android) holding the boot set. It is
   refreshed on every write, never read except by boot, and never treated
   as authoritative. */

import type { SqliteDriver } from '../sqlite/driver.ts';
import type { PortablePreferences } from '../archive/payload';
import { portablePreferencePatch } from './portableShape';
import {
  BOOT_KEYS,
  PREFERENCE_DEFAULTS,
  isPreferenceKey,
  type BootKey,
  type PreferenceKey,
  type PreferenceValues
} from './catalogue.ts';

export type BootPreferences = Pick<PreferenceValues, BootKey>;

export interface PreferenceCache {
  /** Whatever the last write left behind, or nothing on a first-ever boot. */
  read(): Partial<BootPreferences>;
  write(boot: BootPreferences): void;
  /** Back to a first-ever boot. Only the app reset uses this (ticket 17):
      the mirror is what tells a cold start there is a PIN, so it has to go
      when the database it mirrors does. */
  clear(): void;
}

export interface Preferences {
  all(): PreferenceValues;
  get<K extends PreferenceKey>(key: K): PreferenceValues[K];
  set<K extends PreferenceKey>(key: K, value: PreferenceValues[K]): Promise<void>;
  /** Prepare an authoritative snapshot inside a bulk transaction. Invoke
      publication only after commit; later successful writes retain priority. */
  prepareCommittedValues(snapshot: PreferenceValues): () => void;
  /** True when the table held no preferences at the moment this handle
      opened: a genuinely fresh install, as distinct from one whose
      preferences all happen to sit at their defaults. */
  openedEmpty(): boolean;
}

/** Called with the scoped driver inside Archive Replace's row transaction. */
export async function restorePortablePreferencesWithin(
  driver: SqliteDriver,
  portable: Partial<PortablePreferences> | null | undefined
): Promise<PreferenceValues> {
  for (const [key, value] of Object.entries(portablePreferencePatch(portable))) {
    await writePreference(driver, key as PreferenceKey, value);
  }
  return (await readPreferences(driver)).values;
}

async function writePreference(driver: SqliteDriver, key: PreferenceKey, value: unknown): Promise<void> {
  const serialized = JSON.stringify(value);
  await driver.run('INSERT INTO pref (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = ?', [
    key, serialized, serialized
  ]);
}

function bootSubset(values: PreferenceValues): BootPreferences {
  const boot = {} as BootPreferences;
  for (const key of BOOT_KEYS) {
    // Both sides index at the same key, which the compiler can't follow
    // across a loop over a union of key types.
    boot[key] = values[key] as never;
  }
  return boot;
}

async function readPreferences(driver: SqliteDriver) {
  const rows = await driver.query<{ key: string; value: string }>('SELECT key, value FROM pref');
  const values: PreferenceValues = { ...PREFERENCE_DEFAULTS };

  for (const row of rows) {
    // A row this build has no key for comes from an archive written by a
    // newer version. Skipping it leaves it in the table untouched, so
    // downgrading and upgrading again doesn't lose the setting.
    if (isPreferenceKey(row.key)) {
      values[row.key] = JSON.parse(row.value) as never;
    }
  }

  /* The lock-on-leave switch, from before lock timing replaced it (lock-timing
     ticket 01): on locked at the moment of leaving, off never did. Read
     across rather than migrated in SQL, because the old row is one this build
     would otherwise skip, and skipping leaves it in place exactly as it does
     a newer build's row. A timing written since wins. */
  const legacyLock = rows.find((row) => row.key === 'lockOnLeave');
  if (legacyLock && !rows.some((row) => row.key === 'lockAfter')) {
    values.lockAfter = JSON.parse(legacyLock.value) === true ? 'immediately' : 'restart';
  }
  return { rows, values };
}

export async function openPreferences(driver: SqliteDriver, cache?: PreferenceCache): Promise<Preferences> {
  const initial = await readPreferences(driver);
  let values = initial.values;
  const written = new Map<PreferenceKey, number>();
  cache?.write(bootSubset(values));

  return {
    all: () => ({ ...values }),
    get: (key) => values[key],
    openedEmpty: () => initial.rows.length === 0,

    prepareCommittedValues(snapshot) {
      const atPreparation = new Map(written);
      return () => {
        for (const key of Object.keys(snapshot) as PreferenceKey[]) {
          if (written.get(key) === atPreparation.get(key)) values[key] = snapshot[key] as never;
        }
        cache?.write(bootSubset(values));
      };
    },

    async set(key, value) {
      await writePreference(driver, key, value);
      values[key] = value;
      written.set(key, (written.get(key) ?? 0) + 1);
      // Refreshed whole rather than per key: the cache is small, and a
      // partial refresh is how it drifts from the table it mirrors.
      cache?.write(bootSubset(values));
    }
  };
}
