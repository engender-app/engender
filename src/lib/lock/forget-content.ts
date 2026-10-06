/* Journal content the page holds outside the database, which a lock takes
   with it (after-release ticket 10; audit L09-02, L09-03, SEC-08).

   Closing the database and releasing the key leaves the journal itself
   unreadable from this tab, but a few things were copied out of it on the
   way: the reads' last answers (ux-carpet 201), a search held for the way
   back from an entry - in sessionStorage, in plaintext - and a query on its
   way from More, the answers jotted in the room before their debrief, and
   the waveform bars of recordings already played. Each is cheap to
   recompute or deliberately short-lived, so a lock drops all of them rather
   than weighing which are sensitive.

   The holders register here rather than being imported from here, and
   this module imports nothing. Boot imports it, so anything it imported
   joined the first-load graph: the room answers, the held search and the
   waveform cache are route code, and importing them cost two extra files
   on a first visit. A holder's memory exists only once its module has run,
   and its module registers as it runs, so nothing held in memory can miss
   the lock. The held search is the exception, because sessionStorage
   outlives a reload that loaded no search code yet, so its key is removed
   here by name. */

/** The sessionStorage key searchReturn.ts holds a search under. */
export const HELD_SEARCH_KEY = 'engender-search-return';

const holders = new Set<() => void>();

/** Called by a module holding journal content in memory, as it loads. */
export function forgetOnLock(forget: () => void): void {
  holders.add(forget);
}

export function forgetJournalContent(): void {
  for (const forget of holders) forget();
  try {
    sessionStorage.removeItem(HELD_SEARCH_KEY);
  } catch { /* no storage, so nothing was held there */ }
}
