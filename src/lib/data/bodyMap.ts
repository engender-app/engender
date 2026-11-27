/* All body regions share a 0–100 intensity scale.
   Below midpoint is dysphoria, above is euphoria. builtins.ts and
   journal/bodyRegions.ts own the region keys.

   Start an untouched region at the midpoint with no value selected.
   schema.ts excludes the midpoint from storage to preserve the
   difference between no report and a reported feeling. */

import type { BodyRegionAxis } from './types';

export const BODY_REGION_INTENSITY_MIN = 0;
export const BODY_REGION_INTENSITY_MAX = 100;

/** "Picked but not answered": a region sitting here carries
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

/** A region without readings has a null side and draws only an outline.
    For a filled region, value is the mean on that side. Averaging across
    both sides could turn distinct dysphoria and euphoria into a midpoint
    that neither reading describes. */
export interface RegionSideReading {
  region: string;
  side: BodyRegionAxis | null;
  value: number | null;
  /** Readings fell on both sides of the midpoint in this range. Its own
      channel on the shape rather than a third colour: a region that went
      both ways has to stay visible as such whichever side won. */
  mixed: boolean;
  count: number;
  /** How many of those readings the painted `value` is the mean of - the
      dominant side's own count, which is `count` unless the region went both
      ways (phase 11 pre-production UI/UX ticket 30). Both are needed and
      they answer different questions: "most marked" is about how often a
      person reached for a region at all (lookBackReadings.ts), and a mean
      stated beside a number of readings has to be the mean of exactly those
      readings. */
  sideCount: number;
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
  if (count === 0)
    return { region, side: null, value: null, mixed: false, count: 0, sideCount: 0 };

  const dysMean = sides.dysphoriaMean ?? 0;
  const euphMean = sides.euphoriaMean ?? 0;
  const dominant =
    dys !== euph ? (dys > euph ? 'dysphoria' : 'euphoria') : dysMean >= euphMean ? 'dysphoria' : 'euphoria';

  return {
    region,
    side: dominant,
    value: dominant === 'dysphoria' ? dysMean : euphMean,
    mixed: dys > 0 && euph > 0,
    count,
    sideCount: dominant === 'dysphoria' ? dys : euph
  };
}

/**
  * Pair the dominant side's count with its own mean. Counting
  * both sides would assign readings to a mean they never contributed
  * to. Distinguish an absent region, one without either side, and a
  * value. Round intensity here for display in native units
  * (ADR-0012).
  */
export type RegionSummary =
  | { kind: 'none' }
  | { kind: 'reading'; axis: BodyRegionAxis; value: number; mixed: boolean; count: number };

export function regionSummary(reading: RegionSideReading | undefined): RegionSummary {
  if (!reading || reading.side === null || reading.value === null) return { kind: 'none' };
  return {
    kind: 'reading',
    axis: reading.side,
    value: Math.round(reading.value),
    mixed: reading.mixed,
    count: reading.sideCount
  };
}
