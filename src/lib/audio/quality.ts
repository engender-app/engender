/* The quality gate a take has to get through before its numbers mean
   anything (phase 5 deepening ticket 15, CONTEXT: "Voice benchmark").

   A benchmark is comparable to the ones before it only if the conditions
   were the same, so this is the module that decides a take is not worth
   storing. It names which check failed, in the caller's terms rather than in
   decibels, because the retake has to be able to say what to do differently:
   "further from the microphone" is actionable, "peak 0.99" is not.

   Nothing here is a judgement about a voice (PRODUCT.md:109). Every check is
   about the recording - level, room, length, steadiness - and a take that
   fails one is a take to make again, never a voice that fell short.

   Pure, like its siblings, and it takes the pitch track rather than
   recomputing it (see resonance.ts's header for why). */

import type { PitchTrack } from './pitch';

/** Full scale is 1.0, so a peak this close to it means samples were very
    likely already flattened against the rails by the time they arrived. */
export const PEAK_CEILING = 0.98;
/** Voice against room, in dB. Below this the formant estimate starts
    describing the room. */
export const MIN_SNR_DB = 15;
/** Continuous voicing, in seconds. Continuous, not total: three seconds in
    five bursts is not a sustained vowel, and a passage read in fragments
    shorter than this was not read. */
export const MIN_VOICED_SECONDS = 1.5;
/** Coefficient of variation of F0 across the voiced frames. Asked only of
    the sustained vowel - a read passage moves in pitch by design, which is
    why `PASSAGE_CHECKS` leaves this out rather than relaxing the number. */
export const MAX_F0_CV = 0.08;

/** Digital silence has no floor to divide by, so the reported SNR stops
    here rather than running to Infinity. */
const MAX_SNR_DB = 60;

export type QualityCheck = 'clipping' | 'noise' | 'tooShort' | 'unsteady';

/** The passage is read aloud, so its pitch moves. Everything else applies. */
export const PASSAGE_CHECKS: readonly QualityCheck[] = ['clipping', 'noise', 'tooShort'];
/** The vowel is held, so all four apply. */
export const VOWEL_CHECKS: readonly QualityCheck[] = ['clipping', 'noise', 'tooShort', 'unsteady'];

export interface QualityReport {
  /** Largest absolute sample in the take. */
  peak: number;
  /** Voiced level against the room floor. */
  snrDb: number;
  voicedSeconds: number;
  longestVoicedSeconds: number;
  /** null when nothing was voiced, which is not the same as steady. */
  f0Cv: number | null;
  /** Every check that failed, in the order they are listed - all of them,
      not the first, because a take can be both too loud and too short and
      fixing one of those alone is a wasted retake. */
  failed: QualityCheck[];
  passed: boolean;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Voice against room: the median level of the frames the pitch track called
    voiced, over the median level of the frames it did not.

    Splitting on the track rather than on a loudness percentile is what makes
    this a measurement of the room instead of a measurement of the quiet part
    of a sentence: a held vowel has no quiet part, so a percentile floor would
    divide the voice by itself and report every clean sustained take as noisy.

    Two ends of the scale, both stated rather than left implicit. A take with
    no voiced frame has no signal to measure and scores zero, which the length
    check is failing it for anyway. A take with no unvoiced frame has no room
    to measure, and it got that way by being periodic from end to end - which
    is what a clean take with the microphone already running sounds like - so
    it scores the ceiling. */
function signalToNoiseDb(samples: Float32Array, sampleRate: number, track: PitchTrack): number {
  const hop = track.frames.length > 1
    ? Math.round((track.frames[1].atSeconds - track.frames[0].atSeconds) * sampleRate)
    : samples.length;
  if (hop <= 0) return 0;

  const voiced: number[] = [];
  const room: number[] = [];
  for (const frame of track.frames) {
    const from = Math.round(frame.atSeconds * sampleRate);
    const length = Math.min(hop, samples.length - from);
    if (length <= 0) break;
    let sum = 0;
    for (let i = from; i < from + length; i++) sum += samples[i] * samples[i];
    (frame.hz === null ? room : voiced).push(Math.sqrt(sum / length));
  }

  if (voiced.length === 0) return 0;
  if (room.length === 0) return MAX_SNR_DB;
  const floor = median(room);
  if (floor === 0) return MAX_SNR_DB;
  return Math.min(MAX_SNR_DB, 20 * Math.log10(median(voiced) / floor));
}

/** How far the take drifted in pitch, relative to its own centre. Null when
    no frame was voiced: a take with no pitch in it is caught by the length
    check, and calling it steady would be the gate laundering it through. */
function f0CoefficientOfVariation(track: PitchTrack): number | null {
  const voiced = track.frames.filter((frame) => frame.hz !== null).map((frame) => frame.hz as number);
  if (voiced.length === 0) return null;
  const mean = voiced.reduce((total, hz) => total + hz, 0) / voiced.length;
  if (mean === 0) return null;
  const variance = voiced.reduce((total, hz) => total + (hz - mean) * (hz - mean), 0) / voiced.length;
  return Math.sqrt(variance) / mean;
}

export function assessQuality(
  samples: Float32Array,
  sampleRate: number,
  track: PitchTrack,
  checks: readonly QualityCheck[]
): QualityReport {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));

  const snrDb = signalToNoiseDb(samples, sampleRate, track);
  const f0Cv = f0CoefficientOfVariation(track);

  const failing: Record<QualityCheck, boolean> = {
    clipping: peak >= PEAK_CEILING,
    noise: snrDb < MIN_SNR_DB,
    tooShort: track.longestVoicedSeconds < MIN_VOICED_SECONDS,
    // A take with no pitch at all fails the length check, so steadiness has
    // nothing to add to it and stays quiet rather than piling on.
    unsteady: f0Cv !== null && f0Cv > MAX_F0_CV
  };

  const failed = checks.filter((check) => failing[check]);
  return {
    peak,
    snrDb,
    voicedSeconds: track.voicedSeconds,
    longestVoicedSeconds: track.longestVoicedSeconds,
    f0Cv,
    failed,
    passed: failed.length === 0
  };
}
