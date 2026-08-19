/* Body regions (ticket 09, widened to a reference-data area by ticket 30):
   every body region an entry can log an intensity against shares this one
   0-100 intensity scale, rather than a per-region range the way a gender
   dimension has.

   The region keys themselves became a stored reference-data area in ticket
   30 (CONTEXT: "Reference data" - amended) - builtins.ts holds the built-in
   key list now, and journal/bodyRegions.ts the area a custom row is added
   to. What is left here is only the shared intensity scale, which is not a
   "vocabulary" concept the way a key list is and so was never part of that
   move. */

export const BODY_REGION_INTENSITY_MIN = 0;
export const BODY_REGION_INTENSITY_MAX = 100;
export const BODY_REGION_INTENSITY_DEFAULT = 50;
