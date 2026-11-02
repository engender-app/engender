/* Snooze engine for Home live tiles (phase 5 deepening ticket 03,
   CONTEXT: "Live tile", ADR-0039 amendment).
   
   Allows dismissing any state-dependent live tile for a temporary duration (default 24h)
   without flipping its global kind toggle in Settings.

   The deadlines live in the encrypted `acknowledgements` preference
   (functional audit ticket 45), reached through an AcknowledgementStore the
   caller passes, so a test hands in a memory one and the screens hand in the
   preference-backed one. */

import { isTileSnoozed as snoozed, withSnooze, withoutSnooze, type AcknowledgementStore } from './acknowledgements';

/* DEFAULT_SNOOZE_DURATION_MS stays exported only for its own test (AU-09
   test-only review). */
export const DEFAULT_SNOOZE_DURATION_MS = 24 * 60 * 60 * 1000;

/** Snoozes a specific tile for `durationMs` milliseconds from `now`. */
export function snoozeTile(
  key: string,
  store: AcknowledgementStore,
  durationMs: number = DEFAULT_SNOOZE_DURATION_MS,
  now: number = Date.now()
): void {
  store.write(withSnooze(store.read(), key, now + durationMs, now));
}

/** Whether the given tile is currently snoozed at `now`. */
export function isTileSnoozed(key: string, store: AcknowledgementStore, now: number = Date.now()): boolean {
  return snoozed(store.read(), key, now);
}

/** Clears any active snooze for the tile. */
/* clearSnooze stays exported only for its own test (AU-09 test-only review). */
export function clearSnooze(key: string, store: AcknowledgementStore): void {
  store.write(withoutSnooze(store.read(), key));
}
