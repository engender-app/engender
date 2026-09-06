import { describe, expect, it } from 'vitest';
import { DURATION_FALLBACK } from '../motion/tokens';
import {
  PROGRESS_MIN_VISIBLE_MS,
  PROGRESS_SAMPLE_MS,
  PROGRESS_SHOW_DELAY_MS,
  progressFraction,
  progressPercent,
  settleDelay
} from './progress';

describe('progressFraction', () => {
  it('divides a count by its total', () => {
    expect(progressFraction(3, 12)).toBe(0.25);
  });

  it('has no fraction when there is nothing to divide by', () => {
    // Which is the indeterminate case: an operation that is running but
    // cannot say how much of it is left.
    expect(progressFraction(0, 0)).toBe(null);
    expect(progressFraction(4, -1)).toBe(null);
  });

  it('clamps a count that overshoots its total', () => {
    // Restore counts files as they arrive off the stream and a damaged
    // archive can carry more than its manifest names; a bar past 100% is a
    // rendering bug rather than an honest report.
    expect(progressFraction(14, 12)).toBe(1);
    expect(progressFraction(-2, 12)).toBe(0);
  });
});

describe('progressPercent', () => {
  it('snaps to whole percents, which is what the label reads', () => {
    expect(progressPercent(0.256)).toBe(26);
    expect(progressPercent(1)).toBe(100);
  });

  it('has no number for an indeterminate run', () => {
    expect(progressPercent(null)).toBe(null);
  });
});

describe('settleDelay', () => {
  it('holds at full for the completion hold', () => {
    expect(settleDelay(4000, 240)).toBe(240);
  });

  it('cuts the hold to nothing when motion is reduced', () => {
    // motionDuration('--dur-med') is already 0 there, so the hold arrives
    // as 0 rather than being decided a second time here.
    expect(settleDelay(4000, 0)).toBe(0);
  });

  it('keeps a bar that has only just appeared for its minimum', () => {
    // The show delay stops a fast operation from flashing a bar at all;
    // this stops one that crossed the delay by a hair from flashing it for
    // two frames.
    expect(settleDelay(50, 240)).toBe(PROGRESS_MIN_VISIBLE_MS - 50);
    expect(settleDelay(50, 0)).toBe(PROGRESS_MIN_VISIBLE_MS - 50);
  });

  it('never returns a negative wait', () => {
    expect(settleDelay(PROGRESS_MIN_VISIBLE_MS + 1000, 0)).toBe(0);
  });
});

describe('the sample cadence', () => {
  it('is slower than the fill it retriggers', () => {
    /* The whole point of sampling (ADR-0070): the fill tweens over
       --dur-slow, so writing a new transform faster than that never lets a
       tween finish and the bar reads as nervous rather than alive. A
       shorter cadence here would be that bug, so the invariant is asserted
       rather than left to the comment beside the constant. */
    expect(PROGRESS_SAMPLE_MS).toBeGreaterThanOrEqual(DURATION_FALLBACK['--dur-slow']);
  });

  it('shows nothing until an operation has outlasted the show delay', () => {
    expect(PROGRESS_SHOW_DELAY_MS).toBeGreaterThan(0);
    expect(PROGRESS_MIN_VISIBLE_MS).toBeGreaterThan(0);
  });
});
