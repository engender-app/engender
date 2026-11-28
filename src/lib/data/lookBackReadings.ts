/* Own the Look back tiles' reading kinds, routes, span parsing and
   headline calculations. The door shows summaries and subroutes
   show full cards. Body map, Compare and counters keep their existing
   routes. The mood strip stays on the door, Tags owns the good-days
   filter, and Costs shows totals per currency. */
import type { RegionSideReading } from './bodyMap';
import { epochDayFromDateInputValue } from './epochDay';
import { DEFAULT_SPAN_DAYS, spanRangeQuery, type Span } from './lookBackSpan';

/** The readings that open under `/stats/<reading>`, in the door's own
    order. */
export const READINGS = ['day-by-day', 'plane', 'tags', 'cost'] as const;
export type Reading = (typeof READINGS)[number];

export function isReading(value: string | undefined): value is Reading {
  return value !== undefined && (READINGS as readonly string[]).includes(value);
}

/** Where a tile opens: the reading's screen, carrying the span in the same
    query `/body-map` already reads (`spanRangeQuery`),
    so a person who bookmarks a reading gets the stretch they were looking
    at and not today's default. */
export function readingHref(reading: Reading, span: Span): string {
  return `/stats/${reading}${spanRangeQuery(span)}`;
}

/** The span a reading screen was opened at, read back off its query. A
    direct visit with no query, one half of one, or two days the wrong way
    round all fall back to the door's own default window - the last
    `DEFAULT_SPAN_DAYS` ending today - which is the same rule the body map
    follows (body-map/+page.svelte), written once here for the reading
    screens. */
export function spanFromSearch(params: URLSearchParams, todayEpochDay: number): Span {
  const from = epochDayFromDateInputValue(params.get('from') ?? '');
  const to = epochDayFromDateInputValue(params.get('to') ?? '');
  if (from !== null && to !== null && from <= to) return { start: from, end: to };
  return { start: todayEpochDay - DEFAULT_SPAN_DAYS + 1, end: todayEpochDay };
}

/** The region marked most often in the span, for the body map tile's
    headline. By count and not by strength: "most marked" is how often a
    person reached for a region, and the value beside it on the tile is what
    the reading there was. Null where the span holds no region at all. */
export function mostMarkedRegion(readings: readonly RegionSideReading[]): RegionSideReading | null {
  if (readings.length === 0) return null;
  return [...readings].sort((a, b) => b.count - a.count)[0];
}
