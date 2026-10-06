import { afterEach, expect, it, vi } from 'vitest';
import {
  arrivalTooShortToReveal,
  beginTabArrival,
  endTabArrival,
  fitReadArrival,
  playAfterPaint,
  readRevealDuration
} from './screenArrival';

vi.mock('./tokens', () => ({
  motionDuration: (token: string) => ({ '--dur-fast': 150, '--dur-med': 240 })[token] ?? 380
}));

afterEach(() => {
  endTabArrival();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('says an answer must wait only when less than --dur-fast of the arrival is left', () => {
  const now = vi.spyOn(performance, 'now').mockReturnValue(0);
  expect(arrivalTooShortToReveal()).toBe(false);
  beginTabArrival();
  now.mockReturnValue(230);
  expect(arrivalTooShortToReveal()).toBe(false);
  now.mockReturnValue(231);
  expect(arrivalTooShortToReveal()).toBe(true);
  endTabArrival();
  expect(arrivalTooShortToReveal()).toBe(false);
});

it('shortens a reveal to what is left of the arrival but never below --dur-fast', () => {
  const now = vi.spyOn(performance, 'now').mockReturnValue(0);
  expect(readRevealDuration('--dur-med')).toBe(240);
  beginTabArrival();
  now.mockReturnValue(180);
  expect(readRevealDuration('--dur-med')).toBe(200);
  now.mockReturnValue(300);
  expect(readRevealDuration('--dur-med')).toBe(150);
  expect(readRevealDuration('--dur-fast')).toBe(150);
});

it.each([350, 390])('never squeezes a reveal below --dur-fast when paint resumes at %dms', (resumedAt) => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  const now = vi.spyOn(performance, 'now').mockReturnValue(0);
  const animation = {
    playState: 'running',
    currentTime: 0,
    playbackRate: 1,
    effect: { getComputedTiming: () => ({ iterations: 1, duration: 150, endTime: 150 }) },
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
  expect(animation.playbackRate).toBe(1);
  expect(animation.finish).not.toHaveBeenCalled();
  expect(animation.play).toHaveBeenCalledOnce();
});

it('fits a staggered entrance into the arrival, its movement no shorter than --dur-fast', () => {
  const now = vi.spyOn(performance, 'now').mockReturnValue(0);
  const animation = {
    playState: 'paused', currentTime: 0, playbackRate: 1,
    effect: { getComputedTiming: () => ({ iterations: 1, duration: 380, endTime: 430 }) },
    finish: vi.fn()
  };
  beginTabArrival();
  now.mockReturnValue(165);
  fitReadArrival([animation as unknown as Animation]);
  expect(animation.playbackRate).toBe(2);
  now.mockReturnValue(370);
  animation.playbackRate = 1;
  fitReadArrival([animation as unknown as Animation]);
  // The delay may run late; the movement itself still takes 150ms.
  expect(animation.playbackRate).toBeCloseTo(380 / 150);
  expect(animation.finish).not.toHaveBeenCalled();
});

it('keeps field motion at its authored speed while paint is prepared', () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  const now = vi.spyOn(performance, 'now').mockReturnValue(0);
  const animation = {
    playState: 'paused', currentTime: 0, playbackRate: 1,
    effect: { getComputedTiming: () => ({ iterations: 1, duration: 380, endTime: 380 }) },
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

it('does not restart a nested reveal that finished before its queued paint', () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  const now = vi.spyOn(performance, 'now').mockReturnValue(0);
  const animation = {
    playState: 'paused',
    currentTime: 0,
    playbackRate: 1,
    effect: { getComputedTiming: () => ({ iterations: 1, duration: 150, endTime: 150 }) },
    pause: vi.fn(),
    play: vi.fn(),
    cancel: vi.fn(),
    finish: vi.fn(() => { animation.playState = 'finished'; })
  };
  beginTabArrival();
  playAfterPaint({ isConnected: true } as HTMLElement, [animation as unknown as Animation]);
  now.mockReturnValue(380);
  animation.finish();
  frames.shift()!(380);
  frames.shift()!(396);
  expect(animation.play).not.toHaveBeenCalled();
});
