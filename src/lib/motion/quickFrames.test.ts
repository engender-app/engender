import { afterEach, describe, expect, it, vi } from 'vitest';
import { afterQuickFrames } from './quickFrames';

afterEach(() => {
  vi.useRealTimers();
});

/* A window whose frames run when `play` hands them a timestamp. */
function frameWindow() {
  const frames: ((now: number) => void)[] = [];
  const view = { requestAnimationFrame: (cb: (now: number) => void) => frames.push(cb) } as unknown as Window;
  const play = (...times: number[]) => {
    for (const now of times) frames.splice(0).forEach((cb) => cb(now));
  };
  return { view, frames, play };
}

describe('afterQuickFrames', () => {
  it('waits out slow frames and goes after the asked-for run of quick ones', () => {
    vi.useFakeTimers();
    const { view, play } = frameWindow();
    const go = vi.fn();
    afterQuickFrames(view, go, { count: 2, capMs: 1000 });
    play(0, 131, 139);
    expect(go).not.toHaveBeenCalled();
    play(147);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('never counts the first frame, which has no frame before it to measure against', () => {
    vi.useFakeTimers();
    const { view, play } = frameWindow();
    const go = vi.fn();
    afterQuickFrames(view, go, { count: 1, capMs: 1000 });
    play(0);
    expect(go).not.toHaveBeenCalled();
    play(8);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('counts neither a busy frame nor the one after it, which is the first to show what the busy one cost', () => {
    vi.useFakeTimers();
    const { view, play } = frameWindow();
    const go = vi.fn();
    let busy = true;
    afterQuickFrames(view, go, { count: 2, capMs: 1000, busy: () => busy });
    play(0, 8, 16);
    busy = false;
    play(24, 32);
    expect(go).not.toHaveBeenCalled();
    play(40);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('follows a display slower than 60 Hz up to 50 ms, so a stall is never quick', () => {
    vi.useFakeTimers();
    const slow = frameWindow();
    const settles = vi.fn();
    afterQuickFrames(slow.view, settles, { count: 2, capMs: 1000 });
    slow.play(0, 33, 66);
    expect(settles).toHaveBeenCalledTimes(1);

    const stalled = frameWindow();
    const never = vi.fn();
    afterQuickFrames(stalled.view, never, { count: 2, capMs: 1000 });
    stalled.play(0, 192, 367, 542, 717);
    expect(never).not.toHaveBeenCalled();
  });

  it('on a 60 Hz display, keeps one and a half of the shortest frame as the bound, so 40 ms frames never count', () => {
    vi.useFakeTimers();
    const { view, play } = frameWindow();
    const go = vi.fn();
    afterQuickFrames(view, go, { count: 2, capMs: 1000 });
    play(0, 16, 56, 96, 136, 176);
    expect(go).not.toHaveBeenCalled();
  });

  it('with patience, waits that many quick frames until a slow one shows, then only the count after it', () => {
    vi.useFakeTimers();
    const quiet = frameWindow();
    const early = vi.fn();
    afterQuickFrames(quiet.view, early, { count: 2, patience: 6, capMs: 1000 });
    quiet.play(0, 8, 16, 24, 32, 40);
    expect(early).not.toHaveBeenCalled();
    quiet.play(48);
    expect(early).toHaveBeenCalledTimes(1);

    const stall = frameWindow();
    const late = vi.fn();
    afterQuickFrames(stall.view, late, { count: 2, patience: 6, capMs: 1000 });
    stall.play(0, 8, 16, 24, 132, 140);
    expect(late).not.toHaveBeenCalled();
    stall.play(148);
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('goes at the cap when no run of quick frames comes, and only once', () => {
    vi.useFakeTimers();
    const { view, play } = frameWindow();
    const go = vi.fn();
    afterQuickFrames(view, go, { count: 2, capMs: 300 });
    vi.advanceTimersByTime(299);
    expect(go).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(go).toHaveBeenCalledTimes(1);
    play(310, 318, 326);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('stops asking for frames once it has gone', () => {
    vi.useFakeTimers();
    const { view, frames, play } = frameWindow();
    afterQuickFrames(view, () => {}, { count: 1, capMs: 1000 });
    play(0, 8);
    expect(frames).toHaveLength(0);
  });

  it('can be called off, and then never goes', () => {
    vi.useFakeTimers();
    const { view, frames, play } = frameWindow();
    const go = vi.fn();
    const stop = afterQuickFrames(view, go, { count: 1, capMs: 300 });
    play(0);
    stop();
    play(8);
    vi.advanceTimersByTime(300);
    expect(go).not.toHaveBeenCalled();
    expect(frames).toHaveLength(0);
  });
});
