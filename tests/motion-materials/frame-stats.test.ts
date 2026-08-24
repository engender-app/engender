import { describe, expect, it } from 'vitest';

import { medianIntervalMs, frameStats, LONG_FRAME_MULTIPLE } from './frame-stats.ts';

/** Timestamps for `frames` frames at an exact interval, starting at 1000. */
function evenly(frames: number, intervalMs: number, from = 1000): number[] {
  return Array.from({ length: frames + 1 }, (_, i) => from + i * intervalMs);
}

const SIXTY_HZ = 1000 / 60;

describe('medianIntervalMs', () => {
  it('reads a cadence off a run rather than assuming 60Hz', () => {
    expect(medianIntervalMs(evenly(30, 1000 / 120))).toBeCloseTo(1000 / 120, 3);
    expect(medianIntervalMs(evenly(30, SIXTY_HZ))).toBeCloseTo(SIXTY_HZ, 3);
  });

  it('takes the median, so one hitch in the idle run does not become the period', () => {
    const timestamps = evenly(20, SIXTY_HZ);
    timestamps[10] += 40;
    expect(medianIntervalMs(timestamps)).toBeCloseTo(SIXTY_HZ, 1);
  });

  it('refuses a run too short to have a cadence', () => {
    expect(() => medianIntervalMs([1000])).toThrow(/at least/i);
  });
});

describe('frameStats', () => {
  it('reports a clean run as clean', () => {
    const stats = frameStats(evenly(24, SIXTY_HZ), SIXTY_HZ);
    expect(stats.frames).toBe(24);
    expect(stats.medianMs).toBeCloseTo(SIXTY_HZ, 3);
    expect(stats.p95Ms).toBeCloseTo(SIXTY_HZ, 3);
    expect(stats.worstMs).toBeCloseTo(SIXTY_HZ, 3);
    expect(stats.longFrames).toBe(0);
    expect(stats.longFrameShare).toBe(0);
  });

  it('counts a frame that ran past the long-frame multiple of the period', () => {
    const timestamps = evenly(20, SIXTY_HZ);
    for (let i = 10; i < timestamps.length; i++) timestamps[i] += 50;
    const stats = frameStats(timestamps, SIXTY_HZ);
    expect(stats.longFrames).toBe(1);
    expect(stats.longFrameShare).toBeCloseTo(1 / 20, 5);
    expect(stats.worstMs).toBeCloseTo(SIXTY_HZ + 50, 3);
  });

  it('leaves a frame exactly on the multiple alone, so the threshold is a breach not a brush', () => {
    const timestamps = evenly(20, SIXTY_HZ);
    const exact = SIXTY_HZ * LONG_FRAME_MULTIPLE;
    for (let i = 10; i < timestamps.length; i++) timestamps[i] += exact - SIXTY_HZ;
    expect(frameStats(timestamps, SIXTY_HZ).longFrames).toBe(0);
  });

  /* Nearest rank rather than an interpolation, so p95 is always a frame
     that really happened. On a 20-frame run that puts it at the 19th
     interval, which is where the 5% long-frame cap sits too: one long frame
     in twenty is the most the cap allows and p95 stays clean, two is a
     breach and p95 says so. The two limits agree by arithmetic rather than
     by coincidence. */
  it('holds p95 clean at one long frame in twenty and reports the second', () => {
    const one = evenly(20, SIXTY_HZ);
    for (let i = 19; i < one.length; i++) one[i] += 30;
    expect(frameStats(one, SIXTY_HZ).p95Ms).toBeCloseTo(SIXTY_HZ, 3);

    /* Two steps rather than one: shifting a suffix stretches exactly the
       interval at its boundary, whatever the shift. */
    const two = evenly(20, SIXTY_HZ);
    for (let i = 15; i < two.length; i++) two[i] += 30;
    for (let i = 18; i < two.length; i++) two[i] += 30;
    expect(frameStats(two, SIXTY_HZ).p95Ms).toBeCloseTo(SIXTY_HZ + 30, 3);
    expect(frameStats(two, SIXTY_HZ).longFrames).toBe(2);
  });

  it('spans the run so a measurement can be read against the animation it timed', () => {
    const stats = frameStats(evenly(24, SIXTY_HZ), SIXTY_HZ);
    expect(stats.spanMs).toBeCloseTo(24 * SIXTY_HZ, 3);
  });

  it('refuses a run with no frames in it, rather than reporting it as fast', () => {
    expect(() => frameStats([1000], SIXTY_HZ)).toThrow(/at least/i);
  });
});
