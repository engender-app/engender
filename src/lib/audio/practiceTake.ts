/* Per-take arithmetic for a practice session.

   A benchmark reports the 10th and 90th percentile of the voiced frames,
   deliberately not the true minimum and maximum - pitch.ts's own header
   explains why: a single creaky frame at the end of a thirty-second passage
   would move a plain min/max by an octave, and the percentiles are the
   honest span without a hand-tuned filter to defend.

   A practice take is the other case that same reasoning cuts the other way.
   It is short, deliberate and the person knows what they just did, so the
   true extremes are not noise to filter out - they are the answer. Reported
   here rather than added to PitchStats: mixing "the honest span" and "the
   true extremes" into one type would make a caller's choice of field look
   like a typo instead of the deliberate difference it is. */

import type { PitchFrame } from './pitch';
import { median } from './series';

export interface PracticeTakeStats {
  minHz: number;
  maxHz: number;
  medianHz: number;
}

/** Null when nothing in the take was voiced - there is no take to report a
    figure for, the same as PitchTrack.stats. */
export function practiceTakeStats(frames: readonly PitchFrame[]): PracticeTakeStats | null {
  const voiced = frames.filter((frame) => frame.hz !== null).map((frame) => frame.hz as number);
  if (voiced.length === 0) return null;

  return {
    minHz: Math.min(...voiced),
    maxHz: Math.max(...voiced),
    medianHz: median(voiced)
  };
}
