/* What a frame timing run says, once (phase 5 ticket 28).

   The measurement is a list of requestAnimationFrame timestamps taken while
   one animation played, and the arithmetic that turns it into a verdict is
   here rather than in the probe so it can be tested off-device.

   Why rAF intervals and not something closer to the GPU: in Chromium a rAF
   callback is scheduled by the display scheduler's BeginFrame, so when the
   compositor or the raster path misses its deadline the next BeginFrame is
   late and the interval stretches. That makes rAF a usable proxy for
   presented frames even for work that never touches the main thread, which
   is most of what this ticket measures. What it cannot do is say which
   stage was slow: a stretched interval is a cost, not a diagnosis. Nothing
   in a WebView exposes that split without a launch flag, and a measurement
   that needs one is not a measurement of the app as it ships. */

/** A frame is long when its interval runs past this multiple of the display
    period. 1.5 is the usual reading: at 60Hz a 25ms frame missed one vsync
    and the eye sees a stutter, while an 18ms frame is measurement noise. */
export const LONG_FRAME_MULTIPLE = 1.5;

export interface FrameStats {
  /** Intervals in the run, which is one fewer than the timestamps taken. */
  frames: number;
  /** First sample to last, so milliseconds can be read against the
      animation's own duration. */
  spanMs: number;
  medianMs: number;
  p95Ms: number;
  worstMs: number;
  /** Frames past LONG_FRAME_MULTIPLE of the period. */
  longFrames: number;
  /** longFrames as a fraction of frames, which is what the cap is written
      in: a share survives a run that timed more frames than another. */
  longFrameShare: number;
}

function intervals(timestamps: number[]): number[] {
  if (timestamps.length < 2) {
    throw new Error(`a frame timing run needs at least 2 timestamps, got ${timestamps.length}`);
  }
  return timestamps.slice(1).map((at, i) => at - timestamps[i]);
}

/** Nearest rank, which on a short run reports a real frame rather than an
    interpolation between two of them. */
function percentile(sorted: number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)];
}

/** A run's own cadence, used for two different jobs.

    Over an idle run it is the rate rAF is being served at, which is not the
    same question as what the panel can do: Chromium decides for itself
    whether to drive an animation at 60 or at the display's 120, and a cap
    written against the panel would fail every material on a phone that
    animates at half its refresh rate for reasons of its own.

    Over the baseline material's run it is the reference period every
    candidate is judged against - what transform and opacity, the contract
    being amended, actually achieve on this device in this test bed. That is
    the comparison the ticket is asking for, and it is immune to the policy
    question above because both sides of it are measured under the same
    policy. */
export function medianIntervalMs(timestamps: number[]): number {
  const sorted = [...intervals(timestamps)].sort((a, b) => a - b);
  return percentile(sorted, 0.5);
}

export function frameStats(timestamps: number[], periodMs: number): FrameStats {
  const frames = intervals(timestamps);
  const sorted = [...frames].sort((a, b) => a - b);
  const longFrames = frames.filter((ms) => ms > periodMs * LONG_FRAME_MULTIPLE).length;

  return {
    frames: frames.length,
    spanMs: timestamps[timestamps.length - 1] - timestamps[0],
    medianMs: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    worstMs: sorted[sorted.length - 1],
    longFrames,
    longFrameShare: longFrames / frames.length
  };
}
