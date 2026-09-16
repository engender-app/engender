/* The affirming themes: which tags the counterevidence pool carries most
   (phase 5 UX ticket 44's Safe space readings, lifted out of that route by
   phase 11 ticket 07 so the Look back door can state the top theme on a
   tile and draw the card on a screen of its own).

   A count over tag ids, sorted most common first and capped. Labelling a
   tag is the caller's: a built-in tag stores a key and takes its wording
   from the catalogue at display time, and this module reads no
   vocabulary. */
import type { Entry } from './types';

/** How many themes the card draws, the number the Safe space card always
    drew. */
export const AFFIRMING_THEMES_CAP = 5;

export interface AffirmingTheme {
  id: string;
  count: number;
}

export function affirmingThemeCounts(entries: readonly Entry[]): AffirmingTheme[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of entry.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, AFFIRMING_THEMES_CAP)
    .map(([id, count]) => ({ id, count }));
}
