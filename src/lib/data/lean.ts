/* Ranking suggestion pickers by the lean of the scales somebody has ticked
   (phase 5 ticket 43, ADR-0030, CONTEXT: "Lean"). The lean is never stored -
   it follows purely from whether the ticked scales include `femininity` or
   `masculinity` and not the other. Both, neither, or any other combination
   gives no lean, meaning `rankByLean` leaves a list exactly as it was
   handed. Node-tier safe: no paraglide, so the pickers' data layer can call
   this without pulling wording in with it (ADR-0016).

   Named for presets until phase 5 ticket 35, which replaced the eight
   presets with a list of ticked scales. The derivation did not change - the
   same two keys answer it - so the rename is the whole of that ticket's
   business here. */

import type { Lean } from './types';

/** The lean a set of ticked scales carries, derived rather than stored -
    `null` when it has both `femininity` and `masculinity`, or neither, and
    every lean-tagged list should render unranked for it. */
export function scaleLean(scales: readonly string[]): 'femme' | 'masc' | null {
  const hasFemininity = scales.includes('femininity');
  const hasMasculinity = scales.includes('masculinity');
  if (hasFemininity && !hasMasculinity) return 'femme';
  if (hasMasculinity && !hasFemininity) return 'masc';
  return null;
}

/** Matching-lean items first, everything else after, each group keeping its
    own existing order (ADR-0030 - a strict two-bucket sort, not a graded
    score). A `null` lean means the ticked scales carry none, so the list
    comes back unranked rather than grouped around `'neutral'`. */
export function rankByLean<T extends { lean: Lean }>(items: readonly T[], lean: 'femme' | 'masc' | null): T[] {
  if (lean === null) return [...items];
  const matching = items.filter((item) => item.lean === lean);
  const rest = items.filter((item) => item.lean !== lean);
  return [...matching, ...rest];
}
