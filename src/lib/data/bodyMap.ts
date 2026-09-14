/* Body regions (ticket 09, widened to a reference-data area by ticket 30,
   given a second axis by ticket 31, collapsed back to one value by ticket
   39, ADR-0081): every body region an entry can log against shares this
   one 0-100 intensity scale, rather than a per-region range the way a
   gender dimension has - dysphoria below the midpoint, euphoria above it,
   the same shape the day-level euphoria_dysphoria dimension already takes.

   The region keys themselves became a stored reference-data area in ticket
   30 (CONTEXT: "Reference data" - amended) - builtins.ts holds the built-in
   key list now, and journal/bodyRegions.ts the area a custom row is added
   to. What is left here is only the shared intensity scale, which is not a
   "vocabulary" concept the way a key list is and so was never part of that
   move.

   No default value: neither side is pre-filled when a region is picked, so
   there is nothing to seed a slider with. An untouched region sits at the
   midpoint, which is what lets "at peace with this" and "I said nothing
   about this" stay different statements - the CHECK (schema.ts) excludes
   the midpoint from storage for exactly that reason. */

export const BODY_REGION_INTENSITY_MIN = 0;
export const BODY_REGION_INTENSITY_MAX = 100;

/** "Picked but not answered" (ticket 31): a region sitting here carries
    nothing and is dropped on save, the same rule the v81 CHECK enforces on
    a stored row. */
export const BODY_REGION_MIDPOINT = (BODY_REGION_INTENSITY_MIN + BODY_REGION_INTENSITY_MAX) / 2;

/** A plain-object copy: a fresh object with the same region keys and
    values, not the same nested references. Not `structuredClone`: the
    draft's map is a Svelte `$state` proxy in the editor, and cloning a
    proxy throws DataCloneError at runtime. The node tests never see a
    proxy, so this is the kind of break only the walkthrough catches. */
export function copyBodyRegions(regions: Record<string, number>): Record<string, number> {
  return { ...regions };
}
