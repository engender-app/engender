/* The one preference object screens read and write.

   preferences.ts is async and rune-free so it can be tested in the Node
   tier; a Svelte template needs a synchronous, reactive read and a plain
   assignment it can `bind:` to. This is the thin layer between the two: a
   $state projection of the pref table, with writes forwarded to SQLite.

   It is a projection, not a second store. Nothing else caches a preference
   and nothing writes to `values` except this module, so `activePreset`
   cannot end up with two sources of truth while the demo store still owns
   entries (ticket 07 takes those).

   Three phases in a cold start, in order:

     1. Nothing attached. Values are the defaults, then the boot set from
        the cache once boot() reaches step 1. A write here is remembered
        and replayed - onboarding is reachable before SQLite finishes
        opening, and losing the name the user just typed would be its own
        bug.
     2. attachPreferences() lands the real values from SQLite.
     3. Writes go straight through. */

import type { PortablePreferences } from '../archive/payload';
import {
  PORTABLE_KEYS,
  PREFERENCE_DEFAULTS,
  isPreferenceKey,
  type PreferenceKey,
  type PreferenceValues
} from './catalogue';
import type { BootPreferences, Preferences } from './preferences';

const values = $state<PreferenceValues>({ ...PREFERENCE_DEFAULTS });

let backing: Preferences | null = null;
/** Keys written before SQLite opened. Held as keys, not values, so the last
    write of a key wins without any ordering work at flush time. */
const writtenBeforeOpen = new Set<PreferenceKey>();

function write(key: PreferenceKey) {
  if (!backing) {
    writtenBeforeOpen.add(key);
    return;
  }
  backing.set(key, values[key] as never).catch((error) => {
    console.error(`Could not save the "${key}" preference`, error);
  });
}

export const prefs: PreferenceValues = new Proxy(values, {
  set(target, key, value) {
    if (typeof key !== 'string' || !isPreferenceKey(key)) return false;
    Reflect.set(target, key, value);
    write(key);
    return true;
  }
});

/** Sets both halves of the metric together, so the kind and the dimension
    key cannot drift apart. Null means mood. */
export function selectMetric(dimensionKey: string | null) {
  prefs.metricKind = dimensionKey ? 'dimension' : 'mood';
  prefs.metricDimension = dimensionKey;
}

/** Boot step 1: the boot set, read from the mirror before the database is
    open, so first paint uses the user's theme and palette instead of the
    defaults compiled into app.html. Filtered on the way in for the same
    reason boot-cache.ts guards its parse - localStorage is editable by
    hand and survives a downgrade, so it is not trusted to name only
    preferences this build has. */
export function applyCachedBootPreferences(cached: Partial<BootPreferences>) {
  for (const [key, value] of Object.entries(cached)) {
    if (isPreferenceKey(key)) values[key] = value as never;
  }
}

/** The portable preferences a Replace import restores (ADR-0003), written
    through the proxy above so each one lands in SQLite like any other change.
    Walked over PORTABLE_KEYS rather than over what the file happens to hold,
    which is the same allowlist that decided what could travel in the first
    place - and a key the archive is missing keeps this device's value rather
    than becoming undefined. A Merge calls none of this: what is already here
    wins, for its rows and for its settings alike. */
export function applyPortablePreferences(portable: Partial<PortablePreferences>) {
  for (const key of PORTABLE_KEYS) {
    const value = portable?.[key];
    // Both sides index at the same key, which the compiler can't follow
    // across a loop over a union of key types.
    if (value !== undefined) prefs[key] = value as never;
  }
}

/** Boot step 2: SQLite is open and authoritative from here. Anything
    written during step 1 survives - it is newer than what the table holds. */
export async function attachPreferences(preferences: Preferences) {
  const stored = preferences.all();
  for (const key of Object.keys(stored) as PreferenceKey[]) {
    if (!writtenBeforeOpen.has(key)) values[key] = stored[key] as never;
  }

  backing = preferences;

  const replay = [...writtenBeforeOpen];
  writtenBeforeOpen.clear();
  for (const key of replay) write(key);
}
