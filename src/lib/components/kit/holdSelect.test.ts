import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
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

/* A hold has no visible or assistive way in on its own, so each grid that takes one also
   offers a Select button that enters the same picking with nothing picked yet. The runes in
   holdSelect.svelte.ts do not run under this Node config, so what is held here is the
   wiring. */
describe('Select enters picking without a hold', () => {
  const read = (path: string) => readFileSync(path, 'utf8');

  it('lets picking start empty and stay until it is left', () => {
    const source = read('src/lib/components/kit/holdSelect.svelte.ts');
    expect(source).toMatch(/start\(grid\)\s*\{\s*picking = true;/);
    expect(source).toMatch(/get active\(\)\s*\{\s*return picking \|\| ids\.length > 0;/);
  });

  it.each(['src/routes/transition/progress-photos/+page.svelte', 'src/routes/media/photos/+page.svelte'])(
    '%s has a Select button that starts picking',
    (path) => {
      expect(read(path)).toMatch(/data-hold-select-start[^>]*onclick=\{\(\) => held\.start\(gridEl\)\}/);
    }
  );
});
