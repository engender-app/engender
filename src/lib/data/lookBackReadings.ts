/* The Look back door's readings, as a set (phase 11 ticket 07).

   The door used to be a scroll of cards, every one drawn in full at the
   span the rail points at. It is a grid of tiles now, each stating one
   headline figure for the span and opening a screen of its own where the
   full card draws - so the door says six things in one viewport and a
   person opens the one they meant. What this module owns is the part of
   that which is not a component: which readings there are, how a tile
   addresses its screen and how a screen reads the span back, and the
   headline pick that is arithmetic rather than a read.

   Body map, compare and the counters are readings on the door too, but
   they were screens already and keep their addresses; only the three below
   open under `/stats/`. Functional audit ticket 12 cut three: Words,
   Highest days, and affirming themes, which became the share ring's "on
   good days" filter on Tags. Alicja's sign-off on that ticket took the
   mood strip off its own screen: one chart behind a tile was a screen for
   nothing, so it draws on the door under the tiles. */
import type { RegionSideReading } from './bodyMap';
import { epochDayFromDateInputValue } from './epochDay';
import { DEFAULT_SPAN_DAYS, spanRangeQuery, type Span } from './lookBackSpan';

/** The three readings that open under `/stats/<reading>`, in the door's
    own order. */
export const READINGS = ['day-by-day', 'plane', 'tags'] as const;
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
