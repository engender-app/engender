/* One Own-series figure across the benchmarks that can be read together.

   Six of the seven figures a benchmark reports carry no published range and
   nothing to compare against except the person's own earlier takes
   (CONTEXT: "Own-series figure"). The reference screen says that in words.
   This is the half that makes the honest answer useful: the figure over
   time, in its own units.

   **The series breaks rather than joining.** Two takes are readable
   together only if they were read from the same passage and recorded
   through the same capture chain, which is `comparabilityBreak`'s question
   asked along a whole history instead of about one pair - the same gate
   `acousticDelta` computes behind, so the trend and the pair delta cannot
   disagree about which takes go together. What comes out is not one line
   with holes in it but a list of runs, each a stretch the app is willing
   to join, and a reason per gap for the screen to say out loud. A person
   who changes phone loses the comparison, which is a real cost and the
   honest one: the alternative is a line that reads as their voice changing
   on the day they bought a handset.

   No band, no target region and no normalising: what a figure means here
   is a number in the unit it was measured in, and these five have no
   dependable typical range to draw. This module
   produces readings and scales only, and every scale is padded off the
   readings themselves (charts/geometry.ts's own rule for a measurement
   that moves within a few percent of itself).

   Pure, and node-tested. The figure table is keyed by the registry's own
   Own-series keys, so a seventh figure that carries no band is a typecheck
   failure here rather than a figure with no trend. */

import { paddedRange, type PaddedRange, type Sample, type SeriesPoint } from './geometry';
import { comparabilityBreak, type ComparableTake, type SeriesBreak } from '../audio/benchmarkDelta';
import type { OwnSeriesMetricKey } from '../data/voice/metrics';

export type { SeriesBreak };

/** What a trend needs of a benchmark: when it was, what makes it
    comparable, and the figures themselves. Its own interface rather than
    `VoiceBenchmark`, the way `BenchmarkForDelta` is: nothing here reads a
    file name, a note or a stored pitch track.

    The comparability half is `ComparableTake`, shared with the pair delta,
    so the question "can these two be read together" has one answer and one
    type behind it (audio/benchmarkDelta.ts). */
export interface BenchmarkForSeries extends ComparableTake {
  epochDay: number;
  f0P10Hz: number;
  f0P90Hz: number;
  semitoneSd: number;
  wordsPerMinute: number;
  f1Hz: number | null;
  f2Hz: number | null;
  snrDb: number | null;
  resonanceScale: number | null;
}

/** A stretch of benchmarks the app is willing to draw as one line. */
export interface OwnSeriesRun {
  /** `x` is the epoch day, `y` the figure's own value there - null where
      this take did not measure it, which is a gap in the line and not a
      break in the series. */
  points: SeriesPoint[];
  /** The figure's second line where it has one, aligned with `points`.
      Null for a figure drawn as a single line. */
  second: Sample[] | null;
}

export interface OwnSeries {
  /** Oldest first, each one a run of benchmarks that share a passage and a
      chain. Empty under two readings: there is no line to draw. */
  runs: OwnSeriesRun[];
  /** Why `runs[i]` does not join `runs[i + 1]`, so one shorter than the
      runs. */
  breaks: SeriesBreak[];
  /** The scale every run is drawn against, or null with nothing to draw.
      One scale across all the runs rather than one each: two stacked plots
      with private scales would read as comparable while placing the same
      value at two heights. */
  scale: PaddedRange | null;
  /** The second line's scale: the first one's where the two lines are the
      two ends of one range, its own where they are two measures. */
  secondScale: PaddedRange | null;
  /** Whether the second line is placed against the first one's scale. What
      the plot needs to decide whether a value gutter can be printed at all
      (kit/AreaChart.svelte): one range has two ends to print, two ranges
      have none in common. False where there is no second line. */
  secondScaleShared: boolean;
  /** How many benchmarks measured this figure at all. What tells "no take
      has measured this" apart from "one take has", which are different
      sentences on an empty card. */
  readings: number;
}

type ReadFigure = (benchmark: BenchmarkForSeries) => Sample;

interface FigureShape {
  read: ReadFigure;
  /** A figure written as two numbers, and whether the second belongs on
      the first one's scale. The two ends of one range do; two measures do
      not, and F1 near 600 Hz against F2 near 1800 on one scale would draw
      F1 as a flat line. */
  second?: { read: ReadFigure; scale: 'shared' | 'own' };
  /** Where a flat run leaves no spread to take a fifth of, in this
      figure's own units (charts/geometry.ts's `paddedRange`). */
  minPad: number;
}

/* Keyed by the registry rather than listed: adding an Own-series figure to
   data/voice/metrics.ts without a trend for it does not compile.

   `span`'s high end leads and its low end follows, so the solid line is
   the top of the range and the dashed one the bottom, in the order a take
   writes them (`vb_hz_range`). */
const FIGURES: Record<OwnSeriesMetricKey, FigureShape> = {
  span: {
    read: (b) => b.f0P90Hz,
    second: { read: (b) => b.f0P10Hz, scale: 'shared' },
    minPad: 5
  },
  spread: { read: (b) => b.semitoneSd, minPad: 0.2 },
  rate: { read: (b) => b.wordsPerMinute, minPad: 2 },
  resonance: {
    read: (b) => b.f1Hz,
    second: { read: (b) => b.f2Hz, scale: 'own' },
    minPad: 20
  },
  room: { read: (b) => b.snrDb, minPad: 1 },
  /* A factor around 1, not a frequency: a fifth of its own spread would be
     near nothing on a flat run, so the pad is stated in the same units as
     the other single-number figures rather than derived from the value. */
  scale: { read: (b) => b.resonanceScale, minPad: 0.05 }
};

/** One figure across `benchmarks`, oldest first, split wherever the app
    will not join two takes. `benchmarks` arrive in the journal's own order
    (`getBenchmarks`), which is the order they were recorded in. */
export function ownSeries(benchmarks: readonly BenchmarkForSeries[], key: OwnSeriesMetricKey): OwnSeries {
  const figure = FIGURES[key];
  const first = benchmarks.map(figure.read);
  const second = figure.second ? benchmarks.map(figure.second.read) : null;
  const readings = first.filter((sample) => sample !== null).length;

  /* A figure one take measured is a reading and not a trend, and the empty
     card says which of the two it is looking at. Every scale below is
     built on the same test, so a card with no line also has no gutter of
     numbers nothing is drawn against. */
  if (readings < 2) {
    return { runs: [], breaks: [], scale: null, secondScale: null, secondScaleShared: false, readings };
  }

  const shared = figure.second?.scale === 'shared';
  const scale = paddedRange(numbers(shared ? [...first, ...second!] : first), figure.minPad);
  const secondScale =
    second === null ? null : shared ? scale : paddedRange(numbers(second), figure.minPad);

  return {
    ...splitRuns(benchmarks, first, second),
    scale,
    secondScale,
    secondScaleShared: second !== null && shared,
    readings
  };
}

const numbers = (samples: readonly Sample[]): number[] =>
  samples.filter((sample): sample is number => sample !== null);

/** The runs and the reasons between them, in one walk down the history: a
    break is what ends a run, so counting them separately would leave
    `breaks.length === runs.length - 1` as an invariant nobody enforces -
    and the screen indexes `breaks[i - 1]` against the run it drew. */
function splitRuns(
  benchmarks: readonly BenchmarkForSeries[],
  first: readonly Sample[],
  second: readonly Sample[] | null
): { runs: OwnSeriesRun[]; breaks: SeriesBreak[] } {
  const runs: OwnSeriesRun[] = [];
  const breaks: SeriesBreak[] = [];
  benchmarks.forEach((benchmark, i) => {
    const gap = i === 0 ? null : comparabilityBreak(benchmarks[i - 1], benchmark);
    if (gap) breaks.push(gap);
    if (i === 0 || gap) runs.push({ points: [], second: second === null ? null : [] });
    const run = runs[runs.length - 1];
    run.points.push({ x: benchmark.epochDay, y: first[i] });
    if (second !== null) run.second!.push(second[i]);
  });
  return { runs, breaks };
}
