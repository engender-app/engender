import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOLD_MS, HOLD_SLOP_PX, startHold } from './holdSelect';

describe('startHold', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires once a still press has lasted HOLD_MS', () => {
    const onHold = vi.fn();
    const press = startHold(100, 100, onHold);
    vi.advanceTimersByTime(HOLD_MS - 1);
    expect(onHold).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onHold).toHaveBeenCalledTimes(1);
    expect(press.held).toBe(true);
  });

  it('lets a finger wobble inside the slop and still fires', () => {
    const onHold = vi.fn();
    const press = startHold(100, 100, onHold);
    expect(press.move(100 + HOLD_SLOP_PX - 1, 100)).toBe(true);
    vi.advanceTimersByTime(HOLD_MS);
    expect(onHold).toHaveBeenCalledTimes(1);
  });

  it('treats a press that travels as a scroll and never fires', () => {
    const onHold = vi.fn();
    const press = startHold(100, 100, onHold);
    vi.advanceTimersByTime(HOLD_MS / 2);
    expect(press.move(100, 100 + HOLD_SLOP_PX + 1)).toBe(false);
    vi.advanceTimersByTime(HOLD_MS);
    expect(onHold).not.toHaveBeenCalled();
    expect(press.held).toBe(false);
  });

  it('never fires after the finger lifts', () => {
    const onHold = vi.fn();
    const press = startHold(100, 100, onHold);
    press.end();
    vi.advanceTimersByTime(HOLD_MS * 2);
    expect(onHold).not.toHaveBeenCalled();
  });

  it('keeps a fired hold held whatever the finger does afterwards', () => {
    const press = startHold(0, 0, () => {});
    vi.advanceTimersByTime(HOLD_MS);
    expect(press.move(200, 200)).toBe(true);
    press.end();
    expect(press.held).toBe(true);
  });
});
