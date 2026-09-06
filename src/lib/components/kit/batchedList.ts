/* How much of a long log is rendered (phase 8 features ticket 66, ADR-0069).

   A **batch** is a run of rows in the DOM. A **page** is a run of rows read
   out of the journal, which is what search grows and what ADR-0004 bounds -
   the two are different tools and this is the first of them. Nothing here
   asks the journal for anything: the rows are already in hand, and what
   these numbers decide is how many of them the browser is holding.

   Plain TypeScript rather than a `.svelte.ts`, deliberately. A reactive
   wrapper has no `$lib` alias and no rune compilation under the node tier,
   so it could only ever be tested in a browser; the arithmetic is the part
   with the off-by-ones in it, and it should be testable in the fast tier.
   BatchedList.svelte holds the state and the observer and calls in here.

   Every function takes the same pair - how many batches have been asked for,
   and how many rows there are - and holds no state of its own, so a caller
   restoring a remembered count is doing the same arithmetic as a caller that
   has just mounted. */

/** Rows per batch. The same number search calls a page, so the app carries
    one of these rather than two. */
/* BATCH stays exported for its own test, and cross-checked in
   batched-list-cost-device.svelte.ts (AU-09 test-only review). */
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

/** Which batch count renders the row at this index (phase 8 features ticket
    67). A deep link resolves to a position in the same ordered array `items`
    is sliced from, so this is arithmetic over a position rather than a
    search: index 0 falls in the first batch, index BATCH in the second, and
    so on. Answers in one step what growing a batch at a time would otherwise
    take up to `index / BATCH` renders to reach. */
export function batchesFor(index: number): number {
  return Math.floor(Math.max(0, index) / BATCH) + 1;
}
