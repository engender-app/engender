/* The arithmetic behind /compare (pre-release-human ticket 21): which two
   periods it opens on, which scale moved most between them, and how the
   two top-tag lists pair up. Pure over epoch days and plain numbers, so
   nothing here reads the clock or the journal.

   The screen computes a change now. It is signed, in the scale's own
   units, and never coloured: which way a scale moved is not better or
   worse (ADR-0012, F15), and arithmetic is not a judgement. "Largest" is
   measured against each scale's own range, the same normalisation the
   recap uses to pick its biggest dimension change, because a 10 on a
   0-100 scale and a 1 on mood's 1-5 are not the same size of move. */

import { epochDayFromLocalDate, localDateFromEpochDay } from './epochDay';
import type { EpochRange } from './compareStretch';

/** How many days side A covers when nothing handed it a span. */
const DEFAULT_SIDE_DAYS = 30;

/** Side A on a visit with no span: the last 30 days, today included. */
export function defaultSideA(today: number): EpochRange {
  return { start: today - DEFAULT_SIDE_DAYS + 1, end: today };
}

/** The same-length range starting on the same calendar day a year before.
    A 29 February start lands on the 28th, since the year before has none;
    the length is kept either way, so the two sides count the same days. */
export function yearEarlier(range: EpochRange): EpochRange {
  const date = localDateFromEpochDay(range.start);
  const year = date.getFullYear() - 1;
  const month = date.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const start = epochDayFromLocalDate(new Date(year, month, Math.min(date.getDate(), lastDay)));
  return { start, end: start + (range.end - range.start) };
}

/** One scale read over both periods, in native units. A side is null when
    nothing in that period carried the scale. */
export interface ScaleSides {
  key: string;
  min: number;
  max: number;
  a: number | null;
  b: number | null;
}

/** The change as a share of the scale's range, or null with a side missing. */
function relativeChange(scale: ScaleSides): number | null {
  if (scale.a === null || scale.b === null) return null;
  return Math.abs(scale.b - scale.a) / Math.max(scale.max - scale.min, 1);
}

/** The scales by how far they moved for their range, largest first. A
    scale with one side only has no move to rank, so it goes last, in the
    order it came. */
export function orderScales<T extends ScaleSides>(scales: readonly T[]): T[] {
  return scales
    .map((scale, index) => ({ scale, index, change: relativeChange(scale) }))
    .sort((x, y) => {
      if (x.change === null || y.change === null) {
        return x.change === y.change ? x.index - y.index : x.change === null ? 1 : -1;
      }
      return y.change - x.change || x.index - y.index;
    })
    .map((entry) => entry.scale);
}

/** The scale that moved most for its range, or null when no scale has a
    value on both sides. */
export function biggestChange<T extends ScaleSides>(scales: readonly T[]): T | null {
  const first = orderScales(scales)[0];
  return first && relativeChange(first) !== null ? first : null;
}

/** How many of each side's tags the comparison draws. */
const TOP_TAGS = 5;

/** One tag with its count in each period. */
export interface TagPair {
  id: string;
  a: number;
  b: number;
}

/** Both periods' top five, merged: a tag in either list is drawn with its
    count on both sides, so a tag that dropped out of one period's top five
    still shows how often it came up there. In first-seen order (A's top
    five, then B's); the screen picks its own order. */
export function tagPairs(
  a: readonly { id: string; count: number }[],
  b: readonly { id: string; count: number }[]
): TagPair[] {
  const countA = new Map(a.map((t) => [t.id, t.count]));
  const countB = new Map(b.map((t) => [t.id, t.count]));
  const ids = new Set([...a.slice(0, TOP_TAGS), ...b.slice(0, TOP_TAGS)].map((t) => t.id));
  return [...ids]
    .map((id) => ({ id, a: countA.get(id) ?? 0, b: countB.get(id) ?? 0 }));
}

/** Which side came first in time, so a change reads earlier to later.
    B is the reference side, so it goes first when the two start together. */
export function chronological(a: EpochRange, b: EpochRange): { first: 'a' | 'b'; second: 'a' | 'b' } {
  return a.start < b.start ? { first: 'a', second: 'b' } : { first: 'b', second: 'a' };
}
