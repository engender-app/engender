/* Highlight days logged under the chosen presentation without
   filtering the chart. Calendar buckets match if any covered day
   qualifies. Anchored and repeating axes map days with the same
   subtraction or interval rules as the plotted series.

   A single day can earn a highlight. `rekeyDaySeries`'s three-day
   evidence floor applies to plotting a value, so skip it here. */

import type { Keying } from '../data/dayKeying';
import { bucketStart, positionBucket, type Grain } from './grain';

/** The positions, in whatever coordinate space `points` are already drawn
    in, that a day in `presentationDays` lands on.

    `keying` null means the calendar axis: `grain` and `width` are the same
    values the caller bucketed its own points with (atGrain / plotDaySeriesGroup),
    defaulting to an unbucketed day-for-day chart. `keying` non-null means a
    re-keyed axis, where `grain` is ignored and `width` is the fold
    `plotDaySeriesGroup`'s own `foldPositionGroup` settled on for the series
    being drawn. */
export function highlightedPositions(
  presentationDays: readonly number[],
  keying: Keying | null,
  grain: Grain = 'day',
  width: number = 1
): Set<number> {
  if (keying === null) {
    return new Set(presentationDays.map((day) => bucketStart(day, grain)));
  }

  const raw = new Set<number>();
  if (keying.type === 'anchored') {
    for (const day of presentationDays) {
      if (day <= keying.todayEpochDay) raw.add(day - keying.anchorEpochDay);
    }
  } else {
    const days = new Set(presentationDays);
    for (const interval of keying.intervals) {
      for (let offset = 0; offset < interval.length; offset++) {
        if (days.has(interval.startEpochDay + offset)) raw.add(offset + 1);
      }
    }
  }
  return new Set([...raw].map((position) => positionBucket(position, width)));
}
