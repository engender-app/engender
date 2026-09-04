/* The gate, running while the take is still being made (phase 5 deepening
   ticket 15, seam 3).

   The recording screen shows the four checks live during three seconds of
   held breath, which means the analysis has to keep up with the microphone
   rather than run once at the end. YIN over a growing buffer is quadratic in
   the search range and would be re-run from the start on every frame of the
   gauge's animation; on a phone that is where the jank would come from.

   So the frames are computed once each, as the samples that complete them
   arrive, and never again. Everything else the report needs - the peak, the
   room floor, the aggregates - is linear over the buffer and is recomputed
   per reading, which at three seconds of 16 kHz mono is 48000 floats.

   Pure: samples in, a report out. The microphone, the AudioContext and the
   animation frame are the screen's (audio/capture.ts). */

import { frameGeometry, pitchAt, summarizeFrames, type PitchFrame } from './pitch';
import { assessQuality, type QualityCheck, type QualityReport } from './quality';

export interface LiveGauge {
  /** Adds newly captured samples. Chunk sizes need not be regular. */
  push(chunk: Float32Array): void;
  /** The gate's verdict on everything captured so far. */
  read(): QualityReport;
  /** The most recent frames, oldest first: the pitch trace the gauge draws.
      Frames rather than one current value, because steadiness is a shape
      over time and a single number cannot show it. */
  recentFrames(count: number): readonly PitchFrame[];
  /** Everything captured so far, for the take's own final analysis. */
  captured(): Float32Array;
  secondsCaptured(): number;
}

export function makeLiveGauge(sampleRate: number, checks: readonly QualityCheck[]): LiveGauge {
  const geometry = frameGeometry(sampleRate);
  const { windowLength, maxTau, hop, hopSeconds } = geometry;
  // pitchAt's own scratch, held here rather than allocated per frame - the
  // frame geometry the per-frame path used to rebuild on every call.
  const difference = new Float64Array(maxTau + 1);
  const normalized = new Float64Array(maxTau + 1);
  const frames: PitchFrame[] = [];

  // Grown by doubling rather than sized for a fixed ceiling: the passage step
  // has no three-second limit to size against, and a person who reads it
  // twice as slowly is not a case to truncate.
  let buffer = new Float32Array(sampleRate * 4);
  let length = 0;
  /** The first sample offset no frame has been computed from yet. */
  let nextFrameAt = 0;

  return {
    push(chunk) {
      if (length + chunk.length > buffer.length) {
        let capacity = buffer.length * 2;
        while (capacity < length + chunk.length) capacity *= 2;
        const grown = new Float32Array(capacity);
        grown.set(buffer.subarray(0, length));
        buffer = grown;
      }
      buffer.set(chunk, length);
      length += chunk.length;

      const samples = buffer.subarray(0, length);
      // A frame needs the samples after it as well as under it, so this stops
      // short of the end and picks the rest up on a later push.
      for (; nextFrameAt + windowLength + maxTau <= length; nextFrameAt += hop) {
        frames.push({
          atSeconds: nextFrameAt / sampleRate,
          hz: pitchAt(samples, nextFrameAt, sampleRate, geometry, difference, normalized)
        });
      }
    },

    read() {
      return assessQuality(buffer.subarray(0, length), sampleRate, summarizeFrames(frames, hopSeconds), checks);
    },

    recentFrames(count) {
      return frames.slice(Math.max(0, frames.length - count));
    },

    captured() {
      return buffer.subarray(0, length);
    },

    secondsCaptured() {
      return length / sampleRate;
    }
  };
}
