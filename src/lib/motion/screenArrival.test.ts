import { afterEach, expect, it, vi } from 'vitest';
import { beginTabArrival, endTabArrival, fitReadArrival, playAfterPaint } from './screenArrival';

vi.mock('./tokens', () => ({ motionDuration: () => 380 }));

afterEach(() => {
  endTabArrival();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([350, 390])('finishes a reveal by the field deadline after paint resumes at %dms', (resumedAt) => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  const now = vi.spyOn(performance, 'now').mockReturnValue(0);
  const animation = {
    playState: 'running',
    currentTime: 0,
    playbackRate: 1,
    effect: { getComputedTiming: () => ({ iterations: 1, endTime: 150 }) },
    pause: vi.fn(() => { animation.playState = 'paused'; }),
    play: vi.fn(() => { animation.playState = 'running'; }),
    cancel: vi.fn(),
    finish: vi.fn(() => { animation.playState = 'finished'; })
  };
  beginTabArrival();
  now.mockReturnValue(300);
  fitReadArrival([animation as unknown as Animation]);
  playAfterPaint({ isConnected: true } as HTMLElement, [animation as unknown as Animation], { fitArrival: true });
  expect(animation.play).not.toHaveBeenCalled();
  frames.shift()!(320);
  expect(animation.play).not.toHaveBeenCalled();
  now.mockReturnValue(resumedAt);
  if (resumedAt > 380) endTabArrival();
  frames.shift()!(resumedAt);
  if (resumedAt === 350) {
    expect(animation.playbackRate).toBe(5);
    expect(animation.play).toHaveBeenCalledOnce();
  } else {
    expect(animation.finish).toHaveBeenCalledOnce();
    expect(animation.play).not.toHaveBeenCalled();
  }
});

it('keeps field motion at its authored speed while paint is prepared', () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  const now = vi.spyOn(performance, 'now').mockReturnValue(0);
  const animation = {
    playState: 'paused', currentTime: 0, playbackRate: 1,
    effect: { getComputedTiming: () => ({ iterations: 1, endTime: 380 }) },
    pause: vi.fn(), play: vi.fn(), cancel: vi.fn(), finish: vi.fn()
  };
  beginTabArrival();
  playAfterPaint({ isConnected: true } as HTMLElement, [animation as unknown as Animation]);
  frames.shift()!(16);
  now.mockReturnValue(32);
  frames.shift()!(32);
  expect(animation.playbackRate).toBe(1);
  expect(animation.play).toHaveBeenCalledOnce();
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
