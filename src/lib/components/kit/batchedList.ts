/* Choose how many already loaded rows to render (ADR-0069). Batches
   bound DOM rows. Pages bound journal reads (ADR-0004).

   BatchedList.svelte owns state and observation. Keep the arithmetic
   in plain TypeScript for Node tests. Restoring a saved batch count
   uses the same calculation as a fresh mount. */

/** Rows per batch. The same number search calls a page, so the app carries
    one of these rather than two. */
/* BATCH stays exported for its own test. */
export const BATCH = 30;

/** Batches asked for, clamped to at least one: a list always renders
    something, and a remembered count of zero is a count that was never
    written rather than an instruction to render nothing. */
function asked(batches: number): number {
  return Math.max(1, Math.floor(batches));
}

/** How many rows are rendered.

    Bounded by the list's own length, which is what makes a remembered count
    safe to restore: the window can have moved on or a record been deleted
    since it was taken, so the count can name a batch that no longer exists. */
export function shownCount(batches: number, total: number): number {
  return Math.min(asked(batches) * BATCH, Math.max(0, total));
}

/** How many rows are not rendered yet. Nothing, once the list is exhausted. */
export function remainingCount(batches: number, total: number): number {
  return Math.max(0, Math.max(0, total) - shownCount(batches, total));
}

/** How many rows the next batch would add - a whole batch, or whatever is
    left where that is less. What the control at the end of the list says. */
export function nextCount(batches: number, total: number): number {
  return Math.min(BATCH, remainingCount(batches, total));
}

/** Which batch count renders the row at this index. A deep link resolves to a position in the same ordered array `items`
    is sliced from, so this is arithmetic over a position rather than a
    search: index 0 falls in the first batch, index BATCH in the second, and
    so on. Answers in one step what growing a batch at a time would otherwise
    take up to `index / BATCH` renders to reach. */
export function batchesFor(index: number): number {
  return Math.floor(Math.max(0, index) / BATCH) + 1;
}
