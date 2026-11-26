import { afterEach, describe, expect, test, vi } from 'vitest';

const { readRecording } = vi.hoisted(() => ({ readRecording: vi.fn() }));
vi.mock('../stores/voiceFiles', () => ({ readRecording }));

import { forgetPeaks } from './peaks';
import { waveformFor } from './waveform';
import { webm } from '../data/media/audio-fixtures';

afterEach(() => {
  vi.unstubAllGlobals();
  forgetPeaks();
});

describe('waveformFor', () => {
  test('gives an over-long stored recording no bars and never builds a decoder for it', async () => {
    const contexts = vi.fn();
    vi.stubGlobal('OfflineAudioContext', class { constructor() { contexts(); } });
    readRecording.mockResolvedValue(webm({ seconds: 5 * 3600 }));

    expect(await waveformFor('long.webm')).toBeNull();
    expect(contexts).not.toHaveBeenCalled();
  });
});
