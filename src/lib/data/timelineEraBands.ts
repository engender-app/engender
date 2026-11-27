/* Anchor an era band between the first and last rail rows whose spans
   touch it. The rail compresses long gaps into one row, so the
   component measures those rows rather than mapping dates to pixels.
   An era with no row in its span draws no band. */

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

/** How much band a name keeps between itself and a dot's ring. With none, the last letter
    of "Full time" ran into the today dot's ring: the name had 51px between its band's top
    and the ring and was 50px long, so a centred name ended a fraction of a pixel inside it. */
const ERA_LABEL_CLEARANCE_PX = 4;

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

/**
 * Place the band around its first and last row, centered when extending
 * it to minHeight. Find the longest gap between the rings and put the
 * name there. If that gap reaches an end and lacks room, extend that end
 * by the exact shortfall. Moving the ends cannot help a gap between dots.
 *
 * For endsToday, the extra room for the name goes above today so the
 * band does not imply future coverage. The initial minHeight extension
 * stays centered. The 2026-09-16 demo showed 12px past today; moving that
 * extension entirely up left 0.6px from the previous era's label at 1280px.
 */
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
