/* Small figures for the metric sheet. Each shows the person's latest
   value on its axis, without population bands (ADR-0059). */

import { pitchAxis } from '../../audio/bands';
import { latestReading, ownSeries, type BenchmarkForSeries } from '../../charts/ownSeries';
import { type VoiceMetricKey } from './metrics';

/** What `ownSeries` and the pitch figure both need of a benchmark row -
    `BenchmarkForSeries` plus the two fields only pitch reads. */
export interface BenchmarkForMetricFigure extends BenchmarkForSeries {
  f0MedianHz: number;
}

export interface MetricFigureData {
  low: number;
  high: number;
  /** The person's own last take, in the figure's unit - null where nothing
      has measured it yet, which draws no marker rather than one at a
      guessed position. */
  value: number | null;
}

/** The figure for one section, or null where there is nothing yet to draw
    one from - the sheet falls back to its prose alone in that case, the
    same way a card with too little history falls back to its empty state
    elsewhere in this app. */
export function voiceMetricFigure(
  benchmarks: readonly BenchmarkForMetricFigure[],
  key: VoiceMetricKey,
  appLocale: string
): MetricFigureData | null {
  if (benchmarks.length === 0) return null;
  const latest = benchmarks[benchmarks.length - 1];

  if (key === 'pitch') {
    const axis = pitchAxis({ hz: [latest.f0MedianHz], comfort: null });
    return { low: axis.lowHz, high: axis.highHz, value: latest.f0MedianHz };
  }

  const series = ownSeries(benchmarks, key);
  if (!series.scale) return null;
  return { low: series.scale.min, high: series.scale.max, value: latestReading(benchmarks, key) };
}
