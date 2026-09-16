/* The Look back door's readings, as a set (phase 11 ticket 07).

   The door used to be a scroll of cards, every one drawn in full at the
   span the rail points at. It is a grid of tiles now, each stating one
   headline figure for the span and opening a screen of its own where the
   full card draws - so the door says nine things in one viewport and a
   person opens the one they meant. What this module owns is the part of
   that which is not a component: which readings there are, how a tile
   addresses its screen and how a screen reads the span back, and the three
   headline picks that are arithmetic rather than a read.

   Body map and compare are readings on the door too, but they were screens
   already and keep their addresses; only the seven below are new routes,
   which is why `READINGS` has seven entries and the door has nine tiles. */
import type { RegionSideReading } from './bodyMap';
import { epochDayFromDateInputValue } from './epochDay';
import { DEFAULT_SPAN_DAYS, spanRangeQuery, type Span } from './lookBackSpan';
import type { MoodDay } from './statsCharts';

/** The seven readings that open under `/stats/<reading>`, in the door's
    own order. */
export const READINGS = ['day-by-day', 'plane', 'days', 'words', 'tags', 'highest', 'themes'] as const;
export type Reading = (typeof READINGS)[number];

export function isReading(value: string | undefined): value is Reading {
  return value !== undefined && (READINGS as readonly string[]).includes(value);
}

/** Where a tile opens: the reading's screen, carrying the span in the same
    query `/wrapped/range` and `/body-map` already read (`spanRangeQuery`),
    so a person who bookmarks a reading gets the stretch they were looking
    at and not today's default. */
export function readingHref(reading: Reading, span: Span): string {
  return `/stats/${reading}${spanRangeQuery(span)}`;
}

/** The span a reading screen was opened at, read back off its query. A
    direct visit with no query, one half of one, or two days the wrong way
    round all fall back to the door's own default window - the last
    `DEFAULT_SPAN_DAYS` ending today - which is the same rule the body map
    follows (body-map/+page.svelte), written once here for the seven new
    screens. */
export function spanFromSearch(params: URLSearchParams, todayEpochDay: number): Span {
  const from = epochDayFromDateInputValue(params.get('from') ?? '');
  const to = epochDayFromDateInputValue(params.get('to') ?? '');
  if (from !== null && to !== null && from <= to) return { start: from, end: to };
  return { start: todayEpochDay - DEFAULT_SPAN_DAYS + 1, end: todayEpochDay };
}

/** The mood most days of the span landed on, for the days tile's headline:
    the step with the most days, and that count as a share of every day
    that carried a mood. Null over a span with no days at all, which is how
    a tile with nothing to say stays absent. A tie goes to the lower step,
    which is the order the strip is read in. */
export function topMoodStep(steps: readonly MoodDay[]): { step: number; count: number; share: number } | null {
  const total = steps.reduce((sum, step) => sum + step.count, 0);
  if (total === 0) return null;
  const top = [...steps].sort((a, b) => b.count - a.count || a.step - b.step)[0];
  return { step: top.step, count: top.count, share: top.count / total };
}

/** The region marked most often in the span, for the body map tile's
    headline. By count and not by strength: "most marked" is how often a
    person reached for a region, and the value beside it on the tile is what
    the reading there was. Null where the span holds no region at all. */
export function mostMarkedRegion(readings: readonly RegionSideReading[]): RegionSideReading | null {
  if (readings.length === 0) return null;
  return [...readings].sort((a, b) => b.count - a.count)[0];
}
