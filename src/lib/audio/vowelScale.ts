/* One multiplicative factor across the three held vowels (CONTEXT:
   "Own-series figure").

   A single F1/F2 pair is one token: whatever an LPC estimate got wrong on
   that one vowel is wrong in the number a person reads. Three vowels held
   the same way are three independent tokens, and fitting one factor across
   all of them - rather than reading each formant on its own - averages that
   per-token error out while keeping whatever is common to all three: a
   device-constant multiplicative bias, which a single F2 cannot separate
   from the vowel itself.

   `REFERENCE_FORMANTS` is a fixed anchor, not a typical range: it is never
   shown to a person and it is the same anchor every time, which is what
   makes the factor comparable across benchmarks. No band or norm is put on
   this figure - the anchor is an implementation detail of the fit, never a
   claim about anyone's voice. The fit is a geometric mean of
   log-ratios, which is the closed form of least squares over log(observed)
   against log(anchor) - the standard way a single scale factor is pulled out
   of several formant pairs at once.

   Pure, and node-tested against synthesized vowels the way resonance.ts's
   own tests are. */

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
