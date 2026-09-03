/* Which chart positions fall on a day logged under a chosen presentation
   (phase 8 features ticket 17, ADR-0048) - the chip row's whole mechanism.
   It only ever adds a mark to a chart already drawn: ADR-0030's rule, rank
   or highlight and never gate, applies here as "highlight and never filter".

   Two coordinate spaces call this, because a day chart draws in one of two
   ($lib/charts/dayAxis.ts). On the calendar axis a position is a bucket's
   own epoch day (grain.ts's bucketStart), so a bucket is hit when any day
   it covers carries the presentation. On a re-keyed axis (dayKeying.ts) a
   position is not a calendar day at all, so a highlighted day has to be
   carried through the same day-to-position rule the series itself was
   folded by - the anchored axis subtracts the anchor day and the repeating
   axis walks the same completed intervals.

   Deliberately not `rekeyDaySeries` itself: that function's evidence floor
   (three days for a repeating position, ticket 16) answers "is this bucket
   attested enough to plot a value", and a highlight answers a different
   question, "did this happen here at all" - one day is enough to say yes.
   Restating the two mapping rules here, with no floor, is what keeps a
   highlighted set of one day from being folded away as insufficient
   evidence for a claim it never made. */

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
