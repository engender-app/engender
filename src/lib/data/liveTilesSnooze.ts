/* Unified localStorage snooze engine for Home live tiles (phase 5 deepening ticket 03,
   CONTEXT: "Live tile", ADR-0039 amendment).
   
   Allows dismissing any state-dependent live tile for a temporary duration (default 24h)
   without flipping its global kind toggle in Settings. */

/* DEFAULT_SNOOZE_DURATION_MS stays exported only for its own test (AU-09
   test-only review). */
export const DEFAULT_SNOOZE_DURATION_MS = 24 * 60 * 60 * 1000;

/* snoozeKey stays exported only for its own test (AU-09 test-only review). */
export function snoozeKey(tileKey: string): string {
  return `engender-tile-snooze-${tileKey}`;
}

function resolveStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

/** Snoozes a specific tile for `durationMs` milliseconds from `now`. */
export function snoozeTile(
  key: string,
  durationMs: number = DEFAULT_SNOOZE_DURATION_MS,
  now: number = Date.now(),
  storage?: Storage
): void {
  const store = resolveStorage(storage);
  if (!store) return;
  const until = now + durationMs;
  try {
    store.setItem(snoozeKey(key), String(until));
  } catch {
    /* Ignore quota / private browsing errors */
  }
}

/** Whether the given tile is currently snoozed at `now`. */
export function isTileSnoozed(key: string, now: number = Date.now(), storage?: Storage): boolean {
  const store = resolveStorage(storage);
  if (!store) return false;
  try {
    const raw = store.getItem(snoozeKey(key));
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until)) return false;
    return until > now;
  } catch {
    return false;
  }
}

/** Clears any active snooze for the tile. */
/* clearSnooze stays exported only for its own test (AU-09 test-only review). */
export function clearSnooze(key: string, storage?: Storage): void {
  const store = resolveStorage(storage);
  if (!store) return;
  try {
    store.removeItem(snoozeKey(key));
  } catch {
    /* Ignore errors */
  }
}
