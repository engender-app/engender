/* Clear journal content held outside the database on lock: live-query
   results, search text, room answers and waveform caches.

   Holders register when their modules load. Keep this module free of
   imports so boot does not load route code. Also remove the legacy
   sessionStorage search key, which can survive a reload without search. */

/** The legacy sessionStorage key used before searches stayed in memory. */
const HELD_SEARCH_KEY = 'engender-search-return';

const holders = new Set<() => void>();

/** Called by a module holding journal content in memory, as it loads. */
export function forgetOnLock(forget: () => void): void {
  holders.add(forget);
}

/** Every holder runs even if one before it throws: a lock that stopped at
    the first failure would leave the rest of the content in the page. */
export function forgetJournalContent(): void {
  try {
    sessionStorage.removeItem(HELD_SEARCH_KEY);
  } catch { /* no storage, so nothing was held there */ }
  let failure: unknown = null;
  for (const forget of holders) {
    try {
      forget();
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure !== null) throw failure;
}
