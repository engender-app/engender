import { describe, expect, test } from 'vitest';
import {
  REENCODE_AUDIO_BITS,
  VIDEO_CAPTURE_BITS,
  VIDEO_MAX_DURATION_MS,
  VIDEO_MAX_LONG_EDGE,
  VIDEO_MAX_SHORT_EDGE,
  VIDEO_SIZE_CEILING,
  frameSize,
  reencodeTarget,
  videoCaptureConstraints
} from './limits.ts';

const bytesFor = (bitsPerSecond: number, seconds: number) => Math.round((bitsPerSecond * seconds) / 8);

describe('the caps ticket 22 fixes', () => {
  test('are 30 seconds and 1080p, with no setting to read them from', () => {
    expect(VIDEO_MAX_DURATION_MS).toBe(30_000);
    expect(VIDEO_MAX_SHORT_EDGE).toBe(1080);
    expect(VIDEO_MAX_LONG_EDGE).toBe(1920);
  });

  test('ask getUserMedia for audio, and cap both dimensions rather than requesting either exactly', () => {
    const constraints = videoCaptureConstraints();
    expect(constraints.audio).toBe(true);
    // `max` on both, not `height: 1080`: a phone held upright reports its
    // track as 1080x1920, and capping height alone would squash that to
    // 608x1080 - throwing away half the picture to honour a number that
    // already described it.
    expect(constraints.video).toEqual({
      width: { max: VIDEO_MAX_LONG_EDGE },
      height: { max: VIDEO_MAX_LONG_EDGE }
    });
  });

  test('capture aims below the ceiling, so a nominal recording never needs re-encoding', () => {
    const nominal = bytesFor(VIDEO_CAPTURE_BITS.video + VIDEO_CAPTURE_BITS.audio, VIDEO_MAX_DURATION_MS / 1000);
    expect(nominal).toBeLessThan(VIDEO_SIZE_CEILING);
    expect(reencodeTarget(nominal, VIDEO_MAX_DURATION_MS)).toBeNull();
  });
});

describe('reencodeTarget', () => {
  test('leaves a file under the ceiling alone', () => {
    expect(reencodeTarget(VIDEO_SIZE_CEILING - 1, 30_000)).toBeNull();
  });

  test('leaves a file exactly at the ceiling alone - the ceiling is what fits, not what is too big', () => {
    expect(reencodeTarget(VIDEO_SIZE_CEILING, 30_000)).toBeNull();
  });

  test('a file over the ceiling gets a target whose bits fit inside the ceiling', () => {
    const target = reencodeTarget(VIDEO_SIZE_CEILING * 2, 30_000);
    expect(target).not.toBeNull();
    const predicted = bytesFor(target!.videoBitsPerSecond + target!.audioBitsPerSecond, 30);
    expect(predicted).toBeLessThan(VIDEO_SIZE_CEILING);
  });

  test('the target is always below the rate the oversized file was actually written at', () => {
    // Any file over the ceiling at duration D was written above CEILING*8/D,
    // which is what makes one pass enough - no iteration, no measuring twice.
    for (const durationMs of [5_000, 12_500, 30_000]) {
      const oversized = VIDEO_SIZE_CEILING + 1;
      const actual = (oversized * 8) / (durationMs / 1000);
      const target = reencodeTarget(oversized, durationMs)!;
      expect(target.videoBitsPerSecond + target.audioBitsPerSecond).toBeLessThan(actual);
    }
  });

  test('speech keeps a fixed audio budget and video takes the rest', () => {
    const target = reencodeTarget(VIDEO_SIZE_CEILING * 3, 30_000)!;
    expect(target.audioBitsPerSecond).toBe(REENCODE_AUDIO_BITS);
    expect(target.videoBitsPerSecond).toBeGreaterThan(0);
  });

  test('a longer recording gets a lower target, because the same ceiling covers more seconds', () => {
    const short = reencodeTarget(VIDEO_SIZE_CEILING * 2, 10_000)!;
    const long = reencodeTarget(VIDEO_SIZE_CEILING * 2, 30_000)!;
    expect(long.videoBitsPerSecond).toBeLessThan(short.videoBitsPerSecond);
  });

  test('an unknown duration is treated as the full 30 seconds, the most conservative reading', () => {
    // WebM out of MediaRecorder carries no duration (tests/browser-tier
    // journey-probe.ts says so), so a caller that lost its own timing gets
    // the lowest target rather than a division by zero.
    const unknown = reencodeTarget(VIDEO_SIZE_CEILING * 2, 0);
    expect(unknown).toEqual(reencodeTarget(VIDEO_SIZE_CEILING * 2, VIDEO_MAX_DURATION_MS));
  });
});

describe('frameSize', () => {
  test('leaves a capture inside the caps at its own size, never upscaling', () => {
    expect(frameSize(1280, 720)).toEqual({ width: 1280, height: 720 });
    expect(frameSize(640, 480)).toEqual({ width: 640, height: 480 });
  });

  test('landscape 1080p is already the cap, so it passes through', () => {
    expect(frameSize(1920, 1080)).toEqual({ width: 1920, height: 1080 });
  });

  test('portrait 1080p passes through too - 1080 is the short edge, not the height', () => {
    expect(frameSize(1080, 1920)).toEqual({ width: 1080, height: 1920 });
  });

  test('an oversized landscape capture comes down to the long-edge cap', () => {
    expect(frameSize(3840, 2160)).toEqual({ width: 1920, height: 1080 });
  });

  test('an oversized portrait capture comes down the same way, keeping its shape', () => {
    expect(frameSize(2160, 3840)).toEqual({ width: 1080, height: 1920 });
  });

  test('a square capture is bounded by the short edge, so it cannot sneak past on area', () => {
    // 1920x1920 would be 3.7Mpx against 1080p's 2.07Mpx.
    expect(frameSize(1920, 1920)).toEqual({ width: 1080, height: 1080 });
  });

  test('an unusually wide capture is bounded by whichever cap binds first', () => {
    const size = frameSize(4000, 1000);
    expect(size.width).toBeLessThanOrEqual(VIDEO_MAX_LONG_EDGE);
    expect(Math.min(size.width, size.height)).toBeLessThanOrEqual(VIDEO_MAX_SHORT_EDGE);
    // Aspect ratio preserved.
    expect(size.width / size.height).toBeCloseTo(4, 1);
  });
});
