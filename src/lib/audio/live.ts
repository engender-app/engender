/* Compute the four recording checks as samples arrive. Analyze each
   complete YIN frame once and keep running quality aggregates so polling
   has constant cost. Keep only the tail needed by the next frame and two
   seconds of pitch for the trace.

   The end-of-take benchmark computes p10/p90 once from decoded audio.
   audio/capture.ts owns the microphone, clock and frame loop. */

import { frameGeometry, pitchAt, rms, type PitchFrame } from './pitch';
import { assessQuality, runningQualitySignals, type QualityGate, type QualityReport } from './quality';

/** How much of the pitch trace is kept: exactly what the recording screens
    draw, which is two seconds of it (VoiceGauge's TRACE_FRAMES). Beyond that
    a frame has scrolled off the trace and is already counted in the running
    signals, so keeping it would only be keeping it. */
const RETAINED_FRAMES = 200;

export interface LiveGauge {
  /** Adds newly captured samples. Chunk sizes need not be regular. */
  push(chunk: Float32Array): void;
  /** The gate's verdict on everything captured so far. */
  read(): QualityReport;
  /** The most recent frames, oldest first: the pitch trace the gauge draws.
      Frames rather than one current value, because steadiness is a shape
      over time and a single number cannot show it. At most
      `RETAINED_FRAMES` of them, which is what the screens ask for. */
  recentFrames(count: number): readonly PitchFrame[];
  secondsCaptured(): number;
}

export function makeLiveGauge(sampleRate: number, gate: QualityGate): LiveGauge {
  const geometry = frameGeometry(sampleRate);
  const { windowLength, maxTau, hop, hopSeconds } = geometry;
  // pitchAt's own scratch, held here rather than allocated per frame - the
  // frame geometry the per-frame path used to rebuild on every call.
  const difference = new Float64Array(maxTau + 1);
  const normalized = new Float64Array(maxTau + 1);
  const measuring = runningQualitySignals(hopSeconds);
  const frames: PitchFrame[] = [];

  /** How much of the buffer one frame reads: its own window, plus the
      samples after it that YIN shifts the window against. */
  const frameSpan = windowLength + maxTau;

  // The samples no frame has finished with yet. Grown by doubling to fit
  // whatever chunk the microphone hands over, then reused - so this settles
  // at one chunk plus a frame's span and stays there, however long the take
  // runs.
  let pending = new Float32Array(frameSpan * 2);
  /** Where `pending[0]` sits in the take. */
  let pendingFrom = 0;
  let pendingLength = 0;
  /** The first sample offset in the take no frame has been computed from. */
  let nextFrameAt = 0;
  let captured = 0;

  return {
    push(chunk) {
      measuring.observeSamples(chunk);
      captured += chunk.length;

      // Everything before the next frame's start has been read for the last
      // time; it goes before the chunk arrives rather than after, so the
      // buffer is sized against what is still live.
      const finished = nextFrameAt - pendingFrom;
      if (finished > 0) {
        pending.copyWithin(0, finished, pendingLength);
        pendingLength -= finished;
        pendingFrom = nextFrameAt;
      }
      if (pendingLength + chunk.length > pending.length) {
        let capacity = pending.length * 2;
        while (capacity < pendingLength + chunk.length) capacity *= 2;
        const grown = new Float32Array(capacity);
        grown.set(pending.subarray(0, pendingLength));
        pending = grown;
      }
      pending.set(chunk, pendingLength);
      pendingLength += chunk.length;

      // A frame needs the samples after it as well as under it, so this stops
      // short of the end and picks the rest up on a later push.
      const samples = pending.subarray(0, pendingLength);
      for (; nextFrameAt + frameSpan <= pendingFrom + pendingLength; nextFrameAt += hop) {
        const at = nextFrameAt - pendingFrom;
        const hz = pitchAt(samples, at, sampleRate, geometry, difference, normalized);
        measuring.observeFrame(rms(samples, at, hop), hz);
        frames.push({ atSeconds: nextFrameAt / sampleRate, hz });
        if (frames.length > RETAINED_FRAMES) frames.shift();
      }
    },

    read() {
      return assessQuality(measuring.signals(), gate);
    },

    recentFrames(count) {
      return frames.slice(Math.max(0, frames.length - count));
    },

    secondsCaptured() {
      return captured / sampleRate;
    }
  };
}
