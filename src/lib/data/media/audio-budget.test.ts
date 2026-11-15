import { describe, expect, test } from 'vitest';
import { MAX_AUDIO_SECONDS, readAudioInfo, refuseAudioOverBudget } from './audio-budget';
import { mp4, oggOpus, wav, webm } from './audio-fixtures';

describe('readAudioInfo', () => {
  test('reads a WAV header, clamped to the bytes that are there', () => {
    expect(readAudioInfo(wav({ seconds: 2, channels: 2, rate: 8000 }))).toEqual({ seconds: 2, channels: 2 });
    // A header that claims an hour over a few bytes of data is a few bytes long.
    expect(readAudioInfo(wav({ seconds: 3600, dataBytes: 16000 })).seconds).toBe(1);
  });

  test('reads Ogg Opus from the last page, less the pre-skip', () => {
    expect(readAudioInfo(oggOpus({ seconds: 90, channels: 2 }))).toEqual({ seconds: 90, channels: 2 });
  });

  test('reads MP4 from mvhd and mp4a', () => {
    expect(readAudioInfo(mp4({ seconds: 600, channels: 2 }))).toEqual({ seconds: 600, channels: 2 });
  });

  test('reads WebM from Duration, or from the last cluster when the writer left it out', () => {
    expect(readAudioInfo(webm({ seconds: 30, channels: 1 }))).toEqual({ seconds: 30, channels: 1 });
    expect(readAudioInfo(webm({ lastClusterSeconds: 1500 })).seconds).toBe(1500);
  });

  test('says nothing for a container it does not know', () => {
    expect(readAudioInfo(new Uint8Array([1, 2, 3]))).toEqual({ seconds: null, channels: null });
  });
});

describe('refuseAudioOverBudget', () => {
  test('passes the longest recording the 10 MiB ceiling stores at the app opus rate (about 43 min)', () => {
    expect(() => refuseAudioOverBudget(webm({ lastClusterSeconds: 43 * 60 }))).not.toThrow();
  });

  test('passes exactly the limit and refuses a second more', () => {
    expect(() => refuseAudioOverBudget(webm({ seconds: MAX_AUDIO_SECONDS }))).not.toThrow();
    expect(() => refuseAudioOverBudget(webm({ seconds: MAX_AUDIO_SECONDS + 1 }))).toThrow(expect.objectContaining({ kind: 'audio-duration' }));
  });

  test('allows stereo for the full limit but not eight channels for it', () => {
    expect(() => refuseAudioOverBudget(oggOpus({ seconds: MAX_AUDIO_SECONDS, channels: 2 }))).not.toThrow();
    expect(() => refuseAudioOverBudget(oggOpus({ seconds: MAX_AUDIO_SECONDS, channels: 8 }))).toThrow();
    expect(() => refuseAudioOverBudget(oggOpus({ seconds: 1800, channels: 8 }))).not.toThrow();
  });

  test('lets a container with no readable length through rather than guess one from its bytes', () => {
    expect(() => refuseAudioOverBudget(new Uint8Array(10 * 1024 * 1024))).not.toThrow();
  });
});
