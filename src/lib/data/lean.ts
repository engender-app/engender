/* Ranking suggestion pickers by the active preset's lean (phase 5 ticket
   43, ADR-0030, CONTEXT: "Lean"). A preset never stores its own lean - it
   follows purely from whether its `dims` include `femininity` or
   `masculinity` and not the other. Both, neither, or any other combination
   gives no lean, meaning `rankByLean` leaves a list exactly as it was
   handed. Node-tier safe: no paraglide, so the pickers' data layer can call
   this without pulling wording in with it (ADR-0016). */

import type { Lean } from './types';

/** A preset's own lean, derived from its dimensions rather than stored -
    `null` when it has both `femininity` and `masculinity`, or neither, and
    every lean-tagged list should render unranked for it. */
export function presetLean(dims: readonly string[]): 'femme' | 'masc' | null {
  const hasFemininity = dims.includes('femininity');
  const hasMasculinity = dims.includes('masculinity');
  if (hasFemininity && !hasMasculinity) return 'femme';
  if (hasMasculinity && !hasFemininity) return 'masc';
  return null;
}

/** Matching-lean items first, everything else after, each group keeping its
    own existing order (ADR-0030 - a strict two-bucket sort, not a graded
    score). A `null` preset lean means the preset has no lean of its own, so
    the list comes back unranked rather than grouped around `'neutral'`. */
export function rankByLean<T extends { lean: Lean }>(items: readonly T[], lean: 'femme' | 'masc' | null): T[] {
  if (lean === null) return [...items];
  const matching = items.filter((item) => item.lean === lean);
  const rest = items.filter((item) => item.lean !== lean);
  return [...matching, ...rest];
}
