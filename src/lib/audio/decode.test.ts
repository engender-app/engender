import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { decodeToMono, decodeToPeaks } from './decode';
import { webm } from '../data/media/audio-fixtures';

/* The decoder was handed whatever bytes arrived and decoded the full duration before
   anything looked at it. These stand in for the OfflineAudioContext and assert whether
   decoding was reached at all. */

const decodeAudioData = vi.fn();
const contexts = vi.fn();

beforeEach(() => {
  decodeAudioData.mockReset();
  contexts.mockReset();
  vi.stubGlobal(
    'OfflineAudioContext',
    class {
      constructor(...args: unknown[]) {
        contexts(...args);
      }
      decodeAudioData = decodeAudioData;
    }
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('decodeToMono duration budget', () => {
  test('refuses a recording longer than the limit before any decoder exists', async () => {
    const fourHours = webm({ seconds: 4 * 3600 });
    await expect(decodeToMono(fourHours, 8000)).rejects.toMatchObject({ name: 'MediaBudgetError', kind: 'audio-duration' });
    expect(contexts).not.toHaveBeenCalled();
    expect(decodeAudioData).not.toHaveBeenCalled();
  });

  test('refuses a long recording that carries no duration, from its last cluster', async () => {
    const bytes = webm({ lastClusterSeconds: 4 * 3600 });
    await expect(decodeToMono(bytes, 8000)).rejects.toMatchObject({ kind: 'audio-duration' });
    expect(contexts).not.toHaveBeenCalled();
  });

  test('refuses too many channels for the length', async () => {
    await expect(decodeToMono(webm({ seconds: 2000, channels: 8 }), 8000)).rejects.toMatchObject({ kind: 'audio-duration' });
    expect(contexts).not.toHaveBeenCalled();
  });

  test('decodes a 43-minute recording, the longest the 10 MiB ceiling stores at the app opus rate', async () => {
    decodeAudioData.mockResolvedValue({ numberOfChannels: 1, length: 3, getChannelData: () => new Float32Array([0.1, 0.2, 0.3]) });
    const out = await decodeToMono(webm({ seconds: 43 * 60 }), 8000);
    expect(out).toHaveLength(3);
    expect(decodeAudioData).toHaveBeenCalledTimes(1);
  });

  test('decodes a recording exactly at the limit, and a file whose container has no readable header', async () => {
    decodeAudioData.mockResolvedValue({ numberOfChannels: 1, length: 1, getChannelData: () => new Float32Array(1) });
    await decodeToMono(webm({ seconds: 2 * 3600 }), 8000);
    await decodeToMono(new Uint8Array(1000).fill(7), 8000);
    expect(decodeAudioData).toHaveBeenCalledTimes(2);
  });
});

describe('decodeToPeaks', () => {
  test('refuses an over-long recording before any decoder exists', async () => {
    await expect(decodeToPeaks(webm({ seconds: 4 * 3600 }), 8000, 64)).rejects.toMatchObject({ kind: 'audio-duration' });
    expect(contexts).not.toHaveBeenCalled();
  });

  /* After the bars exist, nothing the length of the recording was made
     for them: no mixed copy of a stereo file, and the result is the 64
     bars and not the samples. */
  test('builds the bars without allocating an array the length of the recording', async () => {
    const length = 400_000;
    const channels = [new Float32Array(length).fill(0.3), new Float32Array(length).fill(0.1)];
    decodeAudioData.mockResolvedValue({
      numberOfChannels: 2,
      length,
      getChannelData: (c: number) => channels[c]
    });
    const made: number[] = [];
    const Native = Float32Array;
    vi.stubGlobal(
      'Float32Array',
      new Proxy(Native, {
        construct(target, args, newTarget) {
          if (typeof args[0] === 'number') made.push(args[0]);
          return Reflect.construct(target, args, newTarget);
        }
      })
    );
    let bars: Float32Array;
    try {
      bars = await decodeToPeaks(webm({ seconds: 50, channels: 2 }), 8000, 64);
    } finally {
      vi.stubGlobal('Float32Array', Native);
    }
    expect(bars).toHaveLength(64);
    expect(Math.max(...made)).toBeLessThan(length);
  });
});
