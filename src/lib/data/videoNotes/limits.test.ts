import { describe, expect, test } from 'vitest';
import {
  REENCODE_AUDIO_BITS,
  VIDEO_CAPTURE_BITS,
  VIDEO_MAX_DURATION_MS,
  VIDEO_MAX_EDGE,
  VIDEO_SIZE_CEILING,
  reencodeTarget,
  videoCaptureConstraints
} from './limits.ts';

const bytesFor = (bitsPerSecond: number, seconds: number) => Math.round((bitsPerSecond * seconds) / 8);

describe('the caps ticket 22 fixes', () => {
  test('are 30 seconds and 1080p, with no setting to read them from', () => {
    expect(VIDEO_MAX_DURATION_MS).toBe(30_000);
    expect(VIDEO_MAX_EDGE).toBe(1080);
  });

  test('ask getUserMedia for 1080p and audio, capping height rather than requesting it exactly', () => {
    const constraints = videoCaptureConstraints();
    expect(constraints.audio).toBe(true);
    expect(constraints.video).toEqual({ height: { max: VIDEO_MAX_EDGE }, width: { max: 1920 } });
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
