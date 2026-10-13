import { afterEach, describe, expect, it, vi } from 'vitest';
import { holdUntilPainted } from './paintHold';

afterEach(() => {
  vi.useRealTimers();
});

type State = 'running' | 'paused' | 'finished' | 'idle';
function animation(playState: State, endTime = 280) {
  const a = {
    playState,
    effect: { getComputedTiming: () => ({ endTime }) },
    pause: vi.fn(() => { a.playState = 'paused'; }),
    play: vi.fn(() => { a.playState = 'running'; })
  };
  return a;
}

function documentWith(animations: ReturnType<typeof animation>[]) {
  const frames: ((now: number) => void)[] = [];
  const doc = {
    getAnimations: () => animations,
    defaultView: { requestAnimationFrame: (cb: (now: number) => void) => frames.push(cb) }
  } as unknown as Document;
  const play = (...times: number[]) => {
    for (const now of times) frames.splice(0).forEach((cb) => cb(now));
  };
  return { doc, play };
}

describe('holdUntilPainted', () => {
  it('holds every finite running animation where it is and lets them go together after quick frames', () => {
    vi.useFakeTimers();
    const screen = animation('running');
    const part = animation('running', 400);
    const { doc, play } = documentWith([screen, part]);
    holdUntilPainted(doc);
    expect(screen.pause).toHaveBeenCalledTimes(1);
    expect(part.pause).toHaveBeenCalledTimes(1);
    /* The first held frame is the one that rasters the arriving screen. */
    play(0, 131, 139);
    expect(screen.play).not.toHaveBeenCalled();
    play(147);
    expect(screen.play).toHaveBeenCalledTimes(1);
    expect(part.play).toHaveBeenCalledTimes(1);
  });

  it('holds through the quick frames that come before the slow one, which is what used to end it too early', () => {
    vi.useFakeTimers();
    const screen = animation('running');
    const { doc, play } = documentWith([screen]);
    holdUntilPainted(doc);
    /* As measured after a transition's ready: quick frames, then the raster. */
    play(0, 8, 16, 24, 32);
    expect(screen.play).not.toHaveBeenCalled();
    play(132, 140);
    expect(screen.play).not.toHaveBeenCalled();
    play(148);
    expect(screen.play).toHaveBeenCalledTimes(1);
  });

  it('lets go after six quick frames when no slow frame comes', () => {
    vi.useFakeTimers();
    const screen = animation('running');
    const { doc, play } = documentWith([screen]);
    holdUntilPainted(doc);
    play(0, 8, 16, 24, 32, 40);
    expect(screen.play).not.toHaveBeenCalled();
    play(48);
    expect(screen.play).toHaveBeenCalledTimes(1);
  });

  it('leaves loops and animations that are not running alone', () => {
    vi.useFakeTimers();
    const sweep = animation('running', Infinity);
    const finished = animation('finished');
    const pausedByOwner = animation('paused');
    const { doc, play } = documentWith([sweep, finished, pausedByOwner]);
    holdUntilPainted(doc);
    play(0, 8, 16);
    for (const a of [sweep, finished, pausedByOwner]) {
      expect(a.pause).not.toHaveBeenCalled();
      expect(a.play).not.toHaveBeenCalled();
    }
  });

  it('does not bring back an animation that was cancelled or finished while held', () => {
    vi.useFakeTimers();
    const cancelled = animation('running');
    const finished = animation('running');
    const { doc, play } = documentWith([cancelled, finished]);
    holdUntilPainted(doc);
    cancelled.playState = 'idle';
    finished.playState = 'finished';
    play(0, 8, 16);
    expect(cancelled.play).not.toHaveBeenCalled();
    expect(finished.play).not.toHaveBeenCalled();
  });

  it('lets go at the cap when the frames never come back quick', () => {
    vi.useFakeTimers();
    const screen = animation('running');
    const { doc, play } = documentWith([screen]);
    holdUntilPainted(doc);
    play(0, 192, 367);
    vi.advanceTimersByTime(299);
    expect(screen.play).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(screen.play).toHaveBeenCalledTimes(1);
  });

  it('holds nothing without a window to count frames in', () => {
    const screen = animation('running');
    const doc = { getAnimations: () => [screen], defaultView: null } as unknown as Document;
    holdUntilPainted(doc);
    expect(screen.pause).not.toHaveBeenCalled();
  });
});
