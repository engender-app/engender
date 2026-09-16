/* Search's own history of what was actually searched (ticket 18): the last
   MAX_ENTRIES queries that ran, offered back as tappable rows before a
   character is typed, so a returning search is one tap rather than
   retyped.

   Client-side and per-device, the same footing liveTilesSnooze.ts's
   snoozes stand on: nothing the journal itself reads, backs up or syncs -
   a device's own memory of what its own typing asked for. */

const STORAGE_KEY = 'engender-recent-searches';

/* MAX_ENTRIES stays exported only for its own test. */
export const MAX_ENTRIES = 5;

function resolveStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

function readAll(store: Storage): string[] {
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** The last searches actually run, most recent first, at most MAX_ENTRIES. */
export function listRecentSearches(storage?: Storage): string[] {
  const store = resolveStorage(storage);
  return store ? readAll(store) : [];
}

/** Records a search just run, moving it to the front rather than
    duplicating it if it was already there, and dropping the oldest past
    MAX_ENTRIES. A blank term records nothing - there is no search to
    remember. */
export function recordRecentSearch(term: string, storage?: Storage): void {
  const trimmed = term.trim();
  if (!trimmed) return;
  const store = resolveStorage(storage);
  if (!store) return;
  const next = [trimmed, ...readAll(store).filter((t) => t !== trimmed)].slice(0, MAX_ENTRIES);
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* Ignore quota / private browsing errors */
  }
}
