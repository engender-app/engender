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
