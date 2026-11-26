/* Fit a single multiplicative factor across three held vowels.
   Combining independent F1/F2 measurements reduces per-vowel error
   while retaining common device bias. The least-squares fit in log
   space is the geometric mean of the observed-to-anchor ratios.

   `REFERENCE_FORMANTS` provides a fixed anchor for comparing runs.
   It sets no displayed norm or range. Node tests use synthetic vowels. */

import type { Formants } from './resonance';

export type VowelLabel = 'a' | 'i' | 'u';

/** Below this many vowels, there is nothing to average: a factor fitted to
    one vowel is that vowel's own ratio wearing a different name, not several
    independent tokens agreeing. */
const MIN_VOWELS = 2;

/** The fixed points the fit is measured against - one adult vowel triangle,
    picked once and never a sourced "typical" figure. */
const REFERENCE_FORMANTS: Record<VowelLabel, Formants> = {
  a: { f1Hz: 700, f2Hz: 1200 },
  i: { f1Hz: 300, f2Hz: 2300 },
  u: { f1Hz: 320, f2Hz: 800 }
};

export interface VowelFormants {
  vowel: VowelLabel;
  formants: Formants;
}

/** The factor `k` such that `formants ≈ k * REFERENCE_FORMANTS[vowel]` fits
    `readings` best, in the least-squares sense over log-frequency - which is
    the geometric mean of every observed-over-reference ratio, F1 and F2 both,
    across every vowel handed in.

    Null below `MIN_VOWELS` usable vowels: `readings` is only the ones a
    caller already knows cleared the gate and yielded a resonance (a
    benchmark's own null for a skipped or unmeasurable vowel is filtered out
    before this is called, the way `analyseFormants`'s own null already is
    for one vowel). */
export function fitFormantScale(readings: readonly VowelFormants[]): number | null {
  if (readings.length < MIN_VOWELS) return null;

  let logRatioSum = 0;
  let count = 0;
  for (const { vowel, formants } of readings) {
    const reference = REFERENCE_FORMANTS[vowel];
    logRatioSum += Math.log(formants.f1Hz / reference.f1Hz);
    logRatioSum += Math.log(formants.f2Hz / reference.f2Hz);
    count += 2;
  }
  return Math.exp(logRatioSum / count);
}
