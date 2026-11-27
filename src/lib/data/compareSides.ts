/* The journal reads behind one side of /compare and the compare tile on
   Look back. One function for both, so the
   tile's headline and the screen's headline come from the same numbers.

   Every read starts in the same synchronous turn, so a liveQuery calling
   this declares all of their tables before its first await and settles in
   one run. */

import type { Journal } from './journal/journal';
import type { DayAverage } from './journal/stats';
import type { EpochRange } from './compareStretch';
import type { ScaleSides } from './periodComparison';
import type { GenderDimension } from './types';
import { MOOD_RANGE } from './metricRange';
import { nativeAmount } from './wrappedDisplay';

export interface SideReading {
  entryCount: number;
  /** Each scale's average over the period, by metric key ('mood' and each
      active dimension), or null where nothing in the period carried it.
      Mood is the entries' average, as the recap reads it; a dimension is
      the average of its day averages, as /compare always read it. */
  scales: Record<string, number | null>;
  /** Every tag used in the period with how many entries carried it, most
      first. Empty when only the scales were asked for. */
  tags: { id: string; count: number }[];
  /** Mood per day, for the days-by-mood strip. Empty when only the scales
      were asked for. */
  moodDays: DayAverage[];
}

const mean = (points: DayAverage[]) =>
  points.length ? points.reduce((sum, p) => sum + p.value, 0) / points.length : null;

export async function readSide(
  j: Journal,
  period: EpochRange,
  dimensionKeys: readonly string[],
  options: { scalesOnly?: boolean } = {}
): Promise<SideReading> {
  const recap = j.stats.recap(period.start, period.end);
  const dims = Promise.all(dimensionKeys.map((key) => j.stats.dayAverages(key, period.start, period.end)));
  const tags = options.scalesOnly ? Promise.resolve([]) : j.stats.tagShare(period.start, period.end);
  const moodDays = options.scalesOnly ? Promise.resolve([]) : j.stats.dayAverages('mood', period.start, period.end);
  const [recapAnswer, dimAnswers, tagAnswer, moodAnswer] = await Promise.all([recap, dims, tags, moodDays]);
  const scales: Record<string, number | null> = { mood: recapAnswer.averageMood };
  dimensionKeys.forEach((key, i) => (scales[key] = mean(dimAnswers[i])));
  return { entryCount: recapAnswer.entryCount, scales, tags: tagAnswer, moodDays: moodAnswer };
}

/** A scale over both sides, named and on its own range. */
export interface NamedScale extends ScaleSides {
  name: string;
}

/** Mood and each active dimension over the two sides, each value rounded
    to the precision it is printed at (nativeAmount), so a change is the
    difference of two printed numbers and the ranking agrees with what the
    reader sees. One list for the screen and the tile. */
export function scaleSides(
  a: SideReading,
  b: SideReading,
  dimensions: readonly GenderDimension[],
  moodName: string
): NamedScale[] {
  const at = (key: string, value: number | null | undefined) => (value == null ? null : nativeAmount(key, value));
  return [
    { key: 'mood', name: moodName, ...MOOD_RANGE, a: at('mood', a.scales.mood), b: at('mood', b.scales.mood) },
    ...dimensions.map((d) => ({ key: d.key, name: d.name, min: d.min, max: d.max, a: at(d.key, a.scales[d.key]), b: at(d.key, b.scales[d.key]) }))
  ];
}
