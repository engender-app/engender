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

import type { BodyRegionAxis } from './types';

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

/** One region's readings in a range, split by which side of the midpoint
    they fell on, with each side's mean already in native intensity (0 to
    100 within its own side, the projection `axisFilter` writes in
    stats.ts). A side nobody logged has a null mean and a zero count - they
    always agree, and both are needed: the count decides which side is
    painted and the mean decides how strongly. */
export interface RegionSides {
  region: string;
  dysphoriaCount: number;
  euphoriaCount: number;
  dysphoriaMean: number | null;
  euphoriaMean: number | null;
}

/** What the body map paints for one region (phase 10 redesign ticket 40).

    `side` is null for a region with no readings in the range, which the
    figure draws as an outline and no fill - "undrawn" and "the faintest
    intensity" are different statements and must not look alike, the same
    rule the injection map's never-used dot follows.

    `value` is that side's own mean, native, never a net. A chest logged at
    dysphoria in the morning with a binder on and at euphoria in the evening
    with it off averages out to roughly the midpoint, and painting that day
    as "chest was fine" is false about both entries - the net CONTEXT.md
    forbids by name. */
export interface RegionSideReading {
  region: string;
  side: BodyRegionAxis | null;
  value: number | null;
  /** Readings fell on both sides of the midpoint in this range. Its own
      channel on the shape rather than a third colour: a region that went
      both ways has to stay visible as such whichever side won. */
  mixed: boolean;
  count: number;
}

/** Which side a region mostly sat on, and how strongly it sat there.

    The count decides, because "mostly" is about how often and not about how
    loudly. Where the counts are level - one reading each way, the binder
    day, which is the commonest split there is - the louder side is painted:
    it is the thing that most happened, and `mixed` is already carrying the
    news that the other side happened too. An exact tie on both falls to
    dysphoria, so the answer is the same on every run rather than whichever
    side the driver listed first. */
export function regionReading(sides: RegionSides): RegionSideReading {
  const { region, dysphoriaCount: dys, euphoriaCount: euph } = sides;
  const count = dys + euph;
  if (count === 0) return { region, side: null, value: null, mixed: false, count: 0 };

  const dysMean = sides.dysphoriaMean ?? 0;
  const euphMean = sides.euphoriaMean ?? 0;
  const dominant =
    dys !== euph ? (dys > euph ? 'dysphoria' : 'euphoria') : dysMean >= euphMean ? 'dysphoria' : 'euphoria';

  return {
    region,
    side: dominant,
    value: dominant === 'dysphoria' ? dysMean : euphMean,
    mixed: dys > 0 && euph > 0,
    count
  };
}
