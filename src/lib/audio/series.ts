/* Ordered statistics over a list of numbers (phase 5 deepening ticket 15).

   Three of the four modules in this directory need a median and one needs
   percentiles, and each had written its own four-line copy. They are here
   once instead: the same arithmetic under three different names in sibling
   files is the version that drifts, and this one is small enough that
   sharing it costs nothing at either call site. */

/** The value at `fraction` of the way through an ascending list,
    interpolating between the two neighbours it falls between. The list must
    already be sorted; the callers all have one in hand. */
export function percentileOfSorted(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 1) return sorted[0];
  const at = fraction * (sorted.length - 1);
  const below = Math.floor(at);
  const above = Math.min(below + 1, sorted.length - 1);
  return sorted[below] + (sorted[above] - sorted[below]) * (at - below);
}

/** The middle value, in whatever order the caller's list arrived. */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
