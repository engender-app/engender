/* Body regions (ticket 09, widened to a reference-data area by ticket 30,
   given a second axis by ticket 31): every body region an entry can log
   against shares this one 0-100 intensity scale, rather than a per-region
   range the way a gender dimension has. Both of a region's axes - its
   dysphoria and its euphoria - are measured on it, so there is one scale
   here and not two: the axes differ in what they say, not in how far they
   go.

   The region keys themselves became a stored reference-data area in ticket
   30 (CONTEXT: "Reference data" - amended) - builtins.ts holds the built-in
   key list now, and journal/bodyRegions.ts the area a custom row is added
   to. What is left here is only the shared intensity scale, which is not a
   "vocabulary" concept the way a key list is and so was never part of that
   move.

   No default value: since ticket 31 neither axis is pre-filled when a
   region is picked, so there is nothing to seed a slider with. An untouched
   axis is null, which is what lets "this did not hurt" and "I said nothing
   about whether this hurt" stay different statements. */

import type { BodyRegionFeeling } from './types';

export const BODY_REGION_INTENSITY_MIN = 0;
export const BODY_REGION_INTENSITY_MAX = 100;

/** Whether a region says anything at all. A region can sit in a draft with
    both axes still null - the picker put its sliders on screen and nobody
    has moved one yet - and that is not content: it must not save a blank
    row, and it must not be what keeps an otherwise-empty entry alive. */
export function bodyRegionIsLogged(feeling: BodyRegionFeeling): boolean {
  return feeling.dysphoria !== null || feeling.euphoria !== null;
}

/** A plain-object copy, one level into each feeling.

    Not `structuredClone`: the draft's map is a Svelte `$state` proxy in the
    editor, and cloning a proxy throws DataCloneError at runtime. The node
    tests never see a proxy, so this is the kind of break only the
    walkthrough catches. Not a spread either - that would copy the inner
    feeling objects by reference and let an edit to the draft reach back
    into the entry it was seeded from. */
export function copyBodyRegions(
  regions: Record<string, BodyRegionFeeling>
): Record<string, BodyRegionFeeling> {
  return Object.fromEntries(
    Object.entries(regions).map(([id, f]) => [id, { dysphoria: f.dysphoria, euphoria: f.euphoria }])
  );
}
