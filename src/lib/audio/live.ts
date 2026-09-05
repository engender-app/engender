/* The gate, running while the take is still being made (phase 5 deepening
   ticket 15, seam 3).

   The recording screen shows the four checks live during three seconds of
   held breath, which means the analysis has to keep up with the microphone
   rather than run once at the end. YIN over a growing buffer is quadratic in
   the search range and would be re-run from the start on every frame of the
   gauge's animation; on a phone that is where the jank would come from.

   So the frames are computed once each, as the samples that complete them
   arrive, and never again.

   **Nothing here reads the take twice** (phase 8 audit ticket AU-05). The
   poll used to re-aggregate every sample captured so far - a peak loop and a
   level walk over the whole buffer, ten times a second - so it cost thirty
   times as much at five minutes as at ten seconds and ate the phone's whole
   frame budget somewhere around a minute in. Every one of those aggregates
   is now kept running as frames complete (quality.ts's
   `runningQualitySignals`), and a poll costs the same at any take length.

   That leaves nothing needing the take itself, so the take is not kept. What
   is held is the tail a frame still reads from - a frame is measured against
   the samples after it as well as under it - and the two seconds of pitch
   the gauge draws as its trace.

   The take's own p10/p90 pitch span was the third thing being recomputed per
   poll, and it got no running form because it needed none: `read()` returns
   a `QualityReport`, no check in the gate asks about the span, and the
   summary that computed it was thrown away every time. It is still computed
   once, at the end, from the decoded file (`trackPitch`, benchmark.ts) -
   which is the only place its number was ever read from.

   Pure: samples in, a report out. The microphone, the AudioContext and the
   animation frame are the screen's (audio/capture.ts). */

import { frameGeometry, pitchAt, rms, type PitchFrame } from './pitch';
import { assessQuality, runningQualitySignals, type QualityCheck, type QualityReport } from './quality';

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

export function makeLiveGauge(sampleRate: number, checks: readonly QualityCheck[]): LiveGauge {
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
      return assessQuality(measuring.signals(), checks);
    },

    recentFrames(count) {
      return frames.slice(Math.max(0, frames.length - count));
    },

    secondsCaptured() {
      return captured / sampleRate;
    }
  };
}
