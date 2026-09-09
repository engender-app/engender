/* The one preference object screens read and write.

   preferences.ts is async and rune-free so it can be tested in the Node
   tier; a Svelte template needs a synchronous, reactive read and a plain
   assignment it can `bind:` to. This is the thin layer between the two: a
   $state projection of the pref table, with writes forwarded to SQLite.

   It is a projection, not a second store. Nothing else caches a preference
   and nothing writes to `values` except this module, so `activeScales`
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

/** Writes still in flight. A template assigns to a preference and carries
    on, which is right for every screen in the app: nothing waits on SQLite
    to draw the switch it just flipped. Setup's finish is the one caller
    that has to know when a write has actually landed, because the answer
    it writes last closes the app (onboarding/complete.ts). */
const inFlight = new Set<Promise<void>>();

function write(key: PreferenceKey) {
  if (!backing) {
    writtenBeforeOpen.add(key);
    return;
  }
  const landed = backing.set(key, values[key] as never).catch((error) => {
    console.error(`Could not save the "${key}" preference`, error);
  });
  inFlight.add(landed);
  void landed.finally(() => inFlight.delete(landed));
}

/** Resolves once every write made so far is in SQLite.

    Only meaningful once the table is open, which for its one caller it
    always is: `complete()` is unreachable until the access-mode step has
    created the keystore, and opening the journal is what attaches the
    preferences. Before that, writes are held in `writtenBeforeOpen` and
    there is nothing in flight to wait for - so this resolves at once
    rather than pretending to have flushed something.

    A failed write resolves rather than rejecting, for the same reason
    `write` swallows it: a preference that could not be saved is already
    logged, and setup's finish is not the place to turn that into a dead
    end in front of somebody who has answered every question. */
export async function flushPreferences(): Promise<void> {
  await Promise.all([...inFlight]);
}

/** Writes a preference to SQLite first and projects it second, which is the
    reverse of every other write in this module.

    One preference needs it. Setting `prefs.disguise` is what makes the
    Android launcher alias flip, by way of an effect in +layout.svelte, and
    flipping the alias kills the process (DisguisePlugin). The ordinary
    write leaves those two in a race the process loses: the effect runs on
    a microtask while the write is still out at the database, so a disguise
    turned on can be gone by the next boot - with the alias already
    swapped, so the app closes itself once on launch to put it back. Here
    the value is durable before anything can react to it.

    A write that fails is logged and dropped, like every other write here,
    and the value is *not* projected - which is the whole point rather than
    a shortcut. The one reader of this projection that matters is the
    effect that flips the launcher alias, and flipping it on a preference
    that never landed is the exact state this function exists to prevent:
    the launcher disguised, the preference false, and the app closing
    itself once on the next boot to put the two back in step.

    Nowhere else has this shape, so nothing else should use this: a screen
    that waits on SQLite to redraw a switch is a screen that feels broken. */
export async function setPreferenceDurably<K extends PreferenceKey>(
  key: K,
  value: PreferenceValues[K]
): Promise<void> {
  if (!backing) {
    // Nothing to write to yet, so the ordinary path's replay is the only
    // durability available and waiting would buy nothing.
    prefs[key] = value;
    return;
  }
  try {
    await backing.set(key, value as never);
  } catch (error) {
    console.error(`Could not save the "${key}" preference`, error);
    return;
  }
  // Straight onto the projection rather than through the proxy: the write
  // above is the one this would otherwise queue a second time.
  values[key] = value as never;
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
