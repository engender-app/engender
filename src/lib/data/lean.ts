/* Rank suggestions by the ticked scales. Exactly one of femininity or masculinity supplies
   a lean. With both or neither, keep the given order. The data-layer helper works in the
   Node tier. */

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

/** Put matching items first and preserve order within each group.
    A null lean keeps the original order. */
export function rankByLean<T extends { lean: Lean }>(items: readonly T[], lean: 'femme' | 'masc' | null): T[] {
  if (lean === null) return [...items];
  const matching = items.filter((item) => item.lean === lean);
  const rest = items.filter((item) => item.lean !== lean);
  return [...matching, ...rest];
}
