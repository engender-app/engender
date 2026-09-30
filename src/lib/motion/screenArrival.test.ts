import { afterEach, expect, it, vi } from 'vitest';
import { beginTabArrival, endTabArrival, fitReadArrival, playAfterPaint } from './screenArrival';

vi.mock('./tokens', () => ({ motionDuration: () => 380 }));

afterEach(() => {
  endTabArrival();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('does not restart a nested reveal finished before its queued paint', () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  const now = vi.spyOn(performance, 'now').mockReturnValue(0);
  const animation = {
    playState: 'paused',
    currentTime: 0,
    playbackRate: 1,
    effect: { getComputedTiming: () => ({ iterations: 1, endTime: 150 }) },
    pause: vi.fn(),
    play: vi.fn(),
    cancel: vi.fn(),
    finish: vi.fn(() => { animation.playState = 'finished'; })
  };
  beginTabArrival();
  playAfterPaint({ isConnected: true } as HTMLElement, [animation as unknown as Animation]);
  now.mockReturnValue(380);
  fitReadArrival([animation as unknown as Animation]);
  expect(animation.finish).toHaveBeenCalledOnce();
  frames.shift()!(380);
  frames.shift()!(396);
  expect(animation.play).not.toHaveBeenCalled();
});
