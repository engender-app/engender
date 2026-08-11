/* The one place a native value turns into colour (ADR-0012).

   Two value concepts live in this app and they must never be confused.
   Every number a person sees stays in native units - mood 1 to 5, a gender
   dimension within its own range - and the journal only ever returns
   those. A normalized 0-to-1 value exists so that mood and a 0-10 custom
   dimension shade comparably on the calendar heat-map and the week strip,
   and it is never displayed.

   Import-free on purpose: the journal picks the recap's biggest dimension
   change by normalized magnitude (comparing a 0-100 axis against a 0-10
   one any other way is meaningless) while reporting the change natively,
   and the journal may not import anything above its seam. */

export interface MetricScale {
  min: number;
  max: number;
}

/** Mood is the one metric that is not a gender dimension, so its range
    does not come from a row. */
export const MOOD_SCALE: MetricScale = { min: 1, max: 5 };

/** How many swatches the heat-map and week strip have, not counting the
    empty one. `--heat-1` through `--heat-4` in the palette. */
export const HEAT_LEVELS = 4;

/** Where a value sits in its own range, 0 to 1, clamped. Colour input
    only - showing this number to someone is the bug ADR-0012 exists to
    prevent. */
export function normalize(value: number, scale: MetricScale): number {
  const width = scale.max - scale.min;
  if (width <= 0) return 0; // a scale with no width has one colour, the floor
  return Math.min(1, Math.max(0, (value - scale.min) / width));
}

/** Which swatch a day gets: 0 for a day with no value, otherwise 1 to
    HEAT_LEVELS. A logged low and an empty day are different things, so the
    floor of the scale still lands on level 1. */
export function heatLevel(value: number | null, scale: MetricScale): number {
  if (value == null) return 0;
  return Math.min(HEAT_LEVELS, Math.max(1, Math.ceil(normalize(value, scale) * HEAT_LEVELS)));
}
