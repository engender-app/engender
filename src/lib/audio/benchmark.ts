/* What each of a benchmark's two takes is worth (phase 5 deepening ticket 15,
   CONTEXT: "Voice benchmark").

   The engine's three modules answer three separate questions; this is the
   one place that says which questions get asked of which take, so the
   recording screen holds no analysis of its own and the answer does not
   drift between the live gauge and the take that gets stored.

   The passage is read aloud: it carries the pitch figures and the speaking
   rate, and steadiness is not asked of it. The vowel is held: it carries the
   resonance and the signal-to-noise the resonance was measured under, and
   all four checks apply. Both are descriptive (PRODUCT.md:109).

   Pure, and node-tested: nothing here decodes audio (audio/capture.ts). */

import { trackPitch, wordsPerMinute } from './pitch';
import { analyseFormants, type Formants } from './resonance';
import { PASSAGE_CHECKS, VOWEL_CHECKS, assessQuality, type QualityReport } from './quality';

/** The pitch figures a benchmark row stores, in the row's own terms. Null
    where the take held no voiced frame at all, which the quality report is
    already failing it for. */
export interface PassageFigures {
  f0MedianHz: number;
  f0P10Hz: number;
  f0P90Hz: number;
  semitoneSd: number;
  wordsPerMinute: number;
}

export interface PassageTake {
  quality: QualityReport;
  figures: PassageFigures | null;
}

export interface VowelTake {
  quality: QualityReport;
  /** Null when no vowel could be measured, which a take can be while still
      clearing the gate - a benchmark then keeps its passage and stores no
      resonance. */
  formants: Formants | null;
}

/** The read passage: pitch, its span, its spread, and the rate it was read
    at. `wordCount` is the passage's own, so the rate is words over the time
    from the first voiced frame to the last (CONTEXT: "Benchmark passage"). */
export function analysePassage(samples: Float32Array, sampleRate: number, wordCount: number): PassageTake {
  const track = trackPitch(samples, sampleRate);
  const quality = assessQuality(samples, sampleRate, track, PASSAGE_CHECKS);
  const rate = wordsPerMinute(wordCount, track.spokenSeconds);

  return {
    quality,
    figures:
      track.stats && rate !== null
        ? {
            f0MedianHz: track.stats.medianHz,
            f0P10Hz: track.stats.p10Hz,
            f0P90Hz: track.stats.p90Hz,
            semitoneSd: track.stats.semitoneSd,
            wordsPerMinute: rate
          }
        : null
  };
}

/** The held vowel: the four checks, and the two resonances if the take holds
    them. */
export function analyseVowel(samples: Float32Array, sampleRate: number): VowelTake {
  const track = trackPitch(samples, sampleRate);
  return {
    quality: assessQuality(samples, sampleRate, track, VOWEL_CHECKS),
    formants: analyseFormants(samples, sampleRate, track)
  };
}
