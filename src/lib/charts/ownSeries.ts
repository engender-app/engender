/* One Own-series figure across the benchmarks that can be read together
   (phase 8 features ticket 29, ADR-0060, ADR-0061).

   Five of the six figures a benchmark reports carry no published range and
   nothing to compare against except the person's own earlier takes
   (CONTEXT: "Own-series figure"). Ticket 27 says that in words on the
   reference screen. This is the half that makes the honest answer useful:
   the figure over time, in its own units.

   **The series breaks rather than joining.** Two takes are readable
   together only if they were read from the same passage and recorded
   through the same capture chain, which is `acousticDelta`'s pair of gates
   restated over a whole history instead of over two takes. So what comes
   out is not one line with holes in it but a list of runs, each a stretch
   the app is willing to join, and a reason per gap for the screen to say
   out loud. A person who changes phone loses the comparison, which is a
   real cost and the honest one: the alternative is a line that reads as
   their voice changing on the day they bought a handset.

   Passage before chain, where both changed at once. Two passages leave
   nothing to compare at all - a rate measured over 98 English words and
   over 82 Polish ones are different numbers - while a change of phone
   leaves the figure meaning what it meant and only takes the join away.
   Naming the narrower reason would understate what happened.

   No band, no target region and no normalising: what a figure means here
   is a number in the unit it was measured in, and ADR-0060 is explicit
   that these five have no dependable typical range to draw. This module
   produces readings and scales only, and every scale is padded off the
   readings themselves (charts/geometry.ts's own rule for a measurement
   that moves within a few percent of itself).

   Pure, and node-tested. The figure table is keyed by the registry's own
   Own-series keys, so a seventh figure that carries no band is a typecheck
   failure here rather than a figure with no trend. */

import { paddedRange, type PaddedRange, type Sample, type SeriesPoint } from './geometry';
import { captureChainBreak, type ChainBreak } from '../audio/captureChain';
import type { OwnSeriesMetricKey } from '../data/voice/metrics';

/** Why two neighbouring benchmarks are not one series. The three chain
    breaks (audio/captureChain.ts), plus the passage, which breaks a series
    the way changing phone does (CONTEXT: "Capture chain"). */
export type SeriesBreak = ChainBreak | 'passage';

/** What a trend needs of a benchmark: when it was, what makes it
    comparable, and the figures themselves. Its own interface rather than
    `VoiceBenchmark`, the way `BenchmarkForDelta` is: nothing here reads a
    file name, a note or a stored pitch track. */
export interface BenchmarkForSeries {
  epochDay: number;
  passageKey: string;
  captureChain: string | null;
  f0P10Hz: number;
  f0P90Hz: number;
  semitoneSd: number;
  wordsPerMinute: number;
  f1Hz: number | null;
  f2Hz: number | null;
  snrDb: number | null;
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
  room: { read: (b) => b.snrDb, minPad: 1 }
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
    runs: runsOf(benchmarks, first, second),
    breaks: breaksOf(benchmarks),
    scale,
    secondScale,
    secondScaleShared: second !== null && shared,
    readings
  };
}

const numbers = (samples: readonly Sample[]): number[] =>
  samples.filter((sample): sample is number => sample !== null);

/** Why the series stops between each neighbouring pair, for the pairs where
    it does. */
function breaksOf(benchmarks: readonly BenchmarkForSeries[]): SeriesBreak[] {
  const breaks: SeriesBreak[] = [];
  for (let i = 1; i < benchmarks.length; i++) {
    const gap = breakBetween(benchmarks[i - 1], benchmarks[i]);
    if (gap) breaks.push(gap);
  }
  return breaks;
}

function breakBetween(from: BenchmarkForSeries, to: BenchmarkForSeries): SeriesBreak | null {
  if (from.passageKey !== to.passageKey) return 'passage';
  return captureChainBreak(from.captureChain, to.captureChain);
}

function runsOf(
  benchmarks: readonly BenchmarkForSeries[],
  first: readonly Sample[],
  second: readonly Sample[] | null
): OwnSeriesRun[] {
  const runs: OwnSeriesRun[] = [];
  benchmarks.forEach((benchmark, i) => {
    const carriesOn = i > 0 && breakBetween(benchmarks[i - 1], benchmark) === null;
    if (!carriesOn) runs.push({ points: [], second: second === null ? null : [] });
    const run = runs[runs.length - 1];
    run.points.push({ x: benchmark.epochDay, y: first[i] });
    if (second !== null) run.second!.push(second[i]);
  });
  return runs;
}
