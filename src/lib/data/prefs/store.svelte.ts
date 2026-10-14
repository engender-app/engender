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

import { getLocale, setLocale } from '$lib/paraglide/runtime';
import { PREFERENCE_DEFAULTS, isPreferenceKey, type PreferenceKey, type PreferenceValues } from './catalogue';
import type { BootPreferences, Preferences } from './preferences';

const values = $state<PreferenceValues>({ ...PREFERENCE_DEFAULTS });

/** Whether phase 2 has happened: the stored values are in `values`, not the
    defaults. A cold navigation straight to a screen paints before SQLite
    opens, and a preference that is not in the boot set reads its default
    until then - `lastBackupAt` read null, so the export screen told a
    persona with a 34-day-old backup that it had never been backed up, for
    about 170ms (ticket 176). The same distinction `vocabulary.ready` draws
    for the reference mirror (ticket 152). Stays true across a re-attach:
    the values being replaced are already this journal's, not defaults. */
let attached = $state(false);
export function preferencesAttached(): boolean {
  return attached;
}

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

/** Writes SQLite before projection when a preference can restart the app.
    Disguise flips Android's launcher alias and can kill the process; a
    language change reloads the app through the locale strategy. Their
    effects must not run ahead of the value they need on the next boot.
    A failed write is logged and leaves the projection unchanged. Ordinary
    preferences still use the proxy for an immediate response. */
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

/** Archive Replace committed its portable preferences with its rows. Reload
    the authoritative table and its boot mirror, then refresh this projection
    without queuing duplicate writes. A lock or newer attach owns publication. */
export async function refreshPreferences(): Promise<boolean> {
  const current = backing;
  if (!current) return false;
  await flushPreferences();
  if (backing !== current) return false;
  try {
    await current.reload();
  } catch (error) {
    if (backing !== current) return false;
    throw error;
  }
  if (backing !== current) return false;
  for (const [key, value] of Object.entries(current.all()) as [PreferenceKey, never][]) {
    values[key] = value;
  }
  return true;
}

/** The locale strategy keeps its own choice; SQLite owns the preference.
    Activate only after a durable change or authoritative boot attachment. */
export function activateLanguagePreference() {
  const target = prefs.language === 'en' || prefs.language === 'pl'
    ? prefs.language
    : ((navigator.language || 'en').toLowerCase().startsWith('pl') ? 'pl' : 'en');
  if (target !== getLocale()) setLocale(target);
}

/** The lock's half (after-release ticket 10): the database is about to
    close, so the writes already out at it are waited for, and anything
    written from here on is held the way writes before the first open are,
    for `attachPreferences` to replay once the journal reopens. The values
    stay: the lock screen itself is drawn in the person's theme, palette and
    language, and asks for the lock timing. */
export async function detachPreferences(): Promise<void> {
  backing = null;
  await flushPreferences();
}

/** Boot step 2: SQLite is open and authoritative from here. Anything
    written during step 1 survives - it is newer than what the table holds. */
export async function attachPreferences(preferences: Preferences) {
  const stored = preferences.all();
  for (const key of Object.keys(stored) as PreferenceKey[]) {
    if (!writtenBeforeOpen.has(key)) values[key] = stored[key] as never;
  }

  backing = preferences;
  attached = true;

  const replay = [...writtenBeforeOpen];
  writtenBeforeOpen.clear();
  for (const key of replay) write(key);
}
