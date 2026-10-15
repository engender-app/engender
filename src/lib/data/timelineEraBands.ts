/* Which of the milestone rail's rows (redesign ticket 16) an era's band
   covers.

   The rail has no continuous day-to-pixel scale the way the Look back
   rail's does (lookBackSpan.ts's `railPosition`) - the long empty stretches
   between milestones are compressed to a single gap row rather than drawn
   to real proportion, so a day cannot be interpolated into a pixel here.
   A band is anchored to whichever rows actually exist instead: the
   earliest row whose own span touches the era to the latest one. The
   component then measures those rows like any other block on the rail,
   the same way its axis line already spans from the first item to the
   last without needing a day scale of its own.

   An era with no row inside its span - swept entirely into one compressed
   gap between two milestones that both fall outside it - draws no band.
   There is nothing on the rail for it to run behind, and a rail is a
   record of what is on it rather than a full accounting of every era ever
   named. */

import type { Era } from './types';
import type { TimelineItem } from './timelineItems';

export interface TimelineEraBand {
  id: string;
  name: string;
  /** Indices into the `items` array this was computed against, inclusive -
      the first and last row the band's stripe runs behind. */
  startIndex: number;
  endIndex: number;
}

/** The span of days an item itself occupies: a milestone is a single day,
    a gap is the whole stretch it compresses, and today is the one day it
    names. */
function dayRangeOf(item: TimelineItem, todayEpochDay: number): [number, number] {
  if (item.kind === 'milestone') return [item.milestone.epochDay, item.milestone.epochDay];
  if (item.kind === 'gap') return [item.fromEpochDay, item.toEpochDay];
  return [todayEpochDay, todayEpochDay];
}

export function timelineEraBands(
  items: readonly TimelineItem[],
  eras: readonly Era[],
  todayEpochDay: number
): TimelineEraBand[] {
  const ranges = items.map((item) => dayRangeOf(item, todayEpochDay));
  const out: TimelineEraBand[] = [];

  for (const era of eras) {
    if (era.startEpochDay !== null && era.startEpochDay > todayEpochDay) continue;
    const start = era.startEpochDay ?? -Infinity;
    const end = Math.min(era.endEpochDay ?? todayEpochDay, todayEpochDay);

    let startIndex = -1;
    let endIndex = -1;
    for (let index = 0; index < ranges.length; index += 1) {
      const [from, to] = ranges[index];
      if (to < start || from > end) continue;
      if (startIndex === -1) startIndex = index;
      endIndex = index;
    }
    if (startIndex === -1) continue;

    out.push({ id: era.id, name: era.name, startIndex, endIndex });
  }

  return out;
}

/** How much band a name keeps between itself and a dot's ring (last-audit
    UI 51). With none, the last letter of "Full time" ran into the today
    dot's ring: the name had 51px between its band's top and the ring and
    was 50px long, so a centred name ended a fraction of a pixel inside it. */
export const ERA_LABEL_CLEARANCE_PX = 4;

export interface EraLabelPlacement {
  /** The band, in the same pixels as the rows that placed it. */
  top: number;
  height: number;
  /** The stretch the name is centred in, relative to the band's own top. */
  labelTop: number;
  labelHeight: number;
}

/** The largest run of `[top, bottom]` that none of `rings` reaches into.
    Falls back to the whole span when the rings cover all of it: a name
    with nowhere to go is a worse failure than one that overlaps a ring. */
function largestGap(top: number, bottom: number, rings: readonly (readonly [number, number])[]): [number, number] {
  const sorted = [...rings].sort((a, b) => a[0] - b[0]);
  let cursor = top;
  let best: [number, number] = [top, top];
  for (const [start, end] of sorted) {
    if (start - cursor > best[1] - best[0]) best = [cursor, start];
    cursor = Math.max(cursor, end);
  }
  if (bottom - cursor > best[1] - best[0]) best = [cursor, bottom];
  return best[1] > best[0] ? best : [top, bottom];
}

/** Where an era's band and its name go, given where its rows put it.

    `band` is the stretch from the band's first row to its last, `rings`
    the dots on those rows with their cut-out rings, `nameLength` the
    rendered length of the name and `minHeight` the shortest band the rail
    draws for it. All of them in the same pixels.

    A band shorter than `minHeight` is lengthened around its own middle,
    so it still reads as centred on its rows. The name then goes in the
    longest stretch of the band no ring reaches into, never the band's own
    centre, which would run it through whichever dot sits there. When even
    that stretch is too short for the name and its clearance, the band is
    lengthened again at whichever end already has the more room, by exactly
    the shortfall: a name between two dots cannot be helped by moving the
    band's ends, and a stretch that already holds most of the name only
    needs the rest. A band whose last row is today (`endsToday`) takes
    this second lengthening upwards only: below today is the future, and
    an era drawn into the milestones still ahead would say it runs on into
    them. The first lengthening stays centred even then. That is the
    drawing chosen for short bands on 2026-09-16, it reaches only half the
    shortfall past today (12px on the demo journal), and moving all of it
    above would bring the demo's "Full time" band to 0.6px of the name of
    the era before it at 1280px. */
export function placeEraLabel(
  band: { top: number; height: number },
  rings: readonly (readonly [number, number])[],
  nameLength: number,
  minHeight: number,
  { endsToday = false }: { endsToday?: boolean } = {}
): EraLabelPlacement {
  let { top, height } = band;
  const grow = (by: number, above: number) => {
    top -= above;
    height += by;
  };
  if (height < minHeight) grow(minHeight - height, (minHeight - height) / 2);

  const needed = nameLength + 2 * ERA_LABEL_CLEARANCE_PX;
  let gap = largestGap(top, top + height, rings);
  if (gap[1] - gap[0] < needed) {
    if (rings.length === 0) {
      grow(needed - height, (needed - height) / 2);
    } else {
      const roomAbove = Math.min(...rings.map(([start]) => start)) - top;
      const roomBelow = top + height - Math.max(...rings.map(([, end]) => end));
      if (endsToday || roomAbove >= roomBelow) grow(needed - roomAbove, needed - roomAbove);
      else grow(needed - roomBelow, 0);
    }
    gap = largestGap(top, top + height, rings);
  }

  return { top, height, labelTop: gap[0] - top, labelHeight: gap[1] - gap[0] };
}
