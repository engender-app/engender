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

export interface WearLegendEntry {
  series: WearLegendSeries;
  /** True where this series has no points in the range: the entry reads as
      a note rather than the drawn line's name. */
  empty: boolean;
}

export function wearTrendLegend(hasWear: boolean, hasRegion: boolean): WearLegendEntry[] {
  if (!hasWear && !hasRegion) return [];
  return [
    { series: 'wear', empty: !hasWear },
    { series: 'region', empty: !hasRegion }
  ];
}
