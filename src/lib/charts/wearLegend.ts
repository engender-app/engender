/* The wear trend's legend named two lines even when only one was drawn
   (audit finding U7, ticket 16): the chart's own both-empty guard
   (`wearTrend.length || regionTrend.length`) decides whether to draw the
   chart at all, but did nothing for the case where one series draws and
   the other does not - the legend still promised both.

   Per-series rather than a second combined guard: each series gets its own
   line, drawn or a note that it has nothing in the range, so the legend
   never names a mark that is not on the chart. Both absent returns no
   entries at all - the chart already switches to ChartEmpty then, and a
   legend under an empty chart has nothing to name. */

export type WearLegendSeries = 'wear' | 'region';

/** How a series stands on the chart: drawn as a line, absent from the
    range, or present on one day only, which is a point and not a line
    (after-release 27, audit L05-14). */
export type WearLegendState = 'drawn' | 'empty' | 'one-day';

export interface WearLegendEntry {
  series: WearLegendSeries;
  /** Anything but `drawn` reads as a note rather than the drawn line's
      name. */
  state: WearLegendState;
}

const stateOf = (points: number): WearLegendState => (points >= 2 ? 'drawn' : points === 1 ? 'one-day' : 'empty');

/** The legend for a wear series and a region series of this many days.
    Neither drawn returns no entries: the chart draws a line only from two
    days, so the card switches to its empty state instead. */
export function wearTrendLegend(wearPoints: number, regionPoints: number): WearLegendEntry[] {
  if (wearPoints < 2 && regionPoints < 2) return [];
  return [
    { series: 'wear', state: stateOf(wearPoints) },
    { series: 'region', state: stateOf(regionPoints) }
  ];
}
