/* Search's own history of what was actually searched (ticket 18): the last
   MAX_ENTRIES queries that ran, offered back as tappable rows before a
   character is typed, so a returning search is one tap rather than
   retyped.

   Session memory now, not localStorage (pre-production audit S1): a search
   term is journal content the moment it echoes a diagnosis, a drug or a
   provider's name, and `engender-recent-searches` held the last five in
   plaintext outside ADR-0018's encryption boundary. There is no encrypted
   design for this ticket to reach for, so the history lives only as long as
   the process does - client-side and per-device still, the same footing
   liveTilesSnooze.ts's snoozes stand on, just without a mirror surviving a
   reload. */

const LEGACY_STORAGE_KEY = 'engender-recent-searches';

/* MAX_ENTRIES stays exported only for its own test. */
export const MAX_ENTRIES = 5;

let recent: string[] = [];

/** An install that ran before this ticket may still hold plaintext search
    terms under the old key; a fresh session purges it once so an upgrade
    ends up in the same state a new install already starts in. Exported only
    for its own test - the real caller is the module-load call below. */
export function purgeLegacyRecentSearches(storage?: Storage): void {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return;
  try {
    store.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* Ignore quota / private browsing errors */
  }
}
purgeLegacyRecentSearches();

/** The last searches actually run, most recent first, at most MAX_ENTRIES. */
export function listRecentSearches(): string[] {
  return recent;
}

/** Records a search just run, moving it to the front rather than
    duplicating it if it was already there, and dropping the oldest past
    MAX_ENTRIES. A blank term records nothing - there is no search to
    remember. */
export function recordRecentSearch(term: string): void {
  const trimmed = term.trim();
  if (!trimmed) return;
  recent = [trimmed, ...recent.filter((t) => t !== trimmed)].slice(0, MAX_ENTRIES);
}
