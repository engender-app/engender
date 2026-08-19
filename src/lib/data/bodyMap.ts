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

export const BODY_REGION_INTENSITY_MIN = 0;
export const BODY_REGION_INTENSITY_MAX = 100;
