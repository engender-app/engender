/* A random entry, drawn from the result set already on screen (phase 8
   features ticket 08, spec.md: "Random, scoped"). Never its own read: the
   ticket is explicit that a random draw is a mode of the question currently
   being asked, not a control of its own, so this takes the same `hits` a
   search screen already loaded rather than asking the journal for anything.

   "Repeated draws should not repeat the same entry until the set is
   exhausted" is the one piece of state this needs, and the ticket calls it
   small and not a stored one - kept here as a plain value a caller threads
   through, never localStorage or a preference. Reset is by construction: a
   caller drops the set when the question changes (a fresh `Set()`), and
   this resets it itself once every id in the current set has been drawn. */

import type { Entry } from './types';

export function drawRandomEntry(
  hits: readonly Entry[],
  drawnIds: ReadonlySet<number>,
  random: () => number = Math.random
): { entry: Entry; drawnIds: Set<number> } | null {
  if (hits.length === 0) return null;

  const remaining = hits.filter((entry) => !drawnIds.has(entry.id));
  // Exhausted (or a first draw): every entry is eligible again, the ticket's
  // own "until the set is exhausted or the question changes".
  const pool = remaining.length > 0 ? remaining : hits;

  const picked = pool[Math.floor(random() * pool.length)];
  const nextDrawn = pool === hits ? new Set<number>() : new Set(drawnIds);
  nextDrawn.add(picked.id);

  return { entry: picked, drawnIds: nextDrawn };
}
