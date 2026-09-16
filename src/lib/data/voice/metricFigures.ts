/* What the metric reference sheet's own mini figure draws, per section
   (phase 11 ticket 17).

   Ticket 27's reference screen explained six figures in prose and drew a
   picture for none of them, which read as five omissions once ticket 09
   gave the seventh (pitch) a graph. This is the other six's own figure: an
   axis with its labelled ends and the person's own last take marked on it
   - the axis a benchmark's take already draws its trend against
   (`charts/ownSeries.ts`'s own scale), not a new "typical range" this app
   has no citation for. Pitch keeps its citation (ADR-0059) and gets its
   band from the same source the take's own figure and the compare pair
   already read (`audio/bands.ts`).

   Pure and node-tested, like the two modules it composes: no clock, no
   driver, no paraglide. The benchmarks arrive already read by whichever
   screen holds them - this file decides nothing about the journal. */

import { pitchAxis, bandsFor, type BandLanguage } from '../../audio/bands';
import { latestReading, ownSeries, type BenchmarkForSeries } from '../../charts/ownSeries';
import { bandsOf, VOICE_METRICS, type VoiceMetricKey } from './metrics';

/** What `ownSeries` and the pitch figure both need of a benchmark row -
    `BenchmarkForSeries` plus the two fields only pitch reads. */
export interface BenchmarkForMetricFigure extends BenchmarkForSeries {
  f0MedianHz: number;
}

/** One washed region behind the figure - a published range, only ever on
    pitch (ADR-0059's own rule, read here rather than restated). */
export interface FigureBand {
  low: number;
  high: number;
}

export interface MetricFigureData {
  low: number;
  high: number;
  /** The person's own last take, in the figure's unit - null where nothing
      has measured it yet, which draws no marker rather than one at a
      guessed position. */
  value: number | null;
  /** Empty for every figure but pitch. */
  bands: readonly FigureBand[];
}

const PITCH_METRIC = VOICE_METRICS.find((metric) => metric.key === 'pitch')!;

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
    const { language } = bandsFor(latest.passageKey, appLocale);
    const bands = (bandsOf(PITCH_METRIC, language) ?? []).map((band) => ({
      low: band.lowHz,
      high: band.highHz
    }));
    return { low: axis.lowHz, high: axis.highHz, value: latest.f0MedianHz, bands };
  }

  const series = ownSeries(benchmarks, key);
  if (!series.scale) return null;
  return { low: series.scale.min, high: series.scale.max, value: latestReading(benchmarks, key), bands: [] };
}

export type { BandLanguage };
