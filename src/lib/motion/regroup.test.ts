import { describe, expect, it } from 'vitest';

import { regroupSteps, type CellBox } from './regroup';

/** A month's worth of cells laid out along one row, the way the Journal
    door's compact strip draws them. */
function ribbon(count: number, width = 8, height = 24): CellBox[] {
  return Array.from({ length: count }, (_, i) => ({
    key: i + 1,
    left: 20 + i * (width + 2),
    top: 100,
    width,
    height
  }));
}

/** The same days in a seven-column grid, the way the expanded heat map
    draws them: a row per week, a square per day. */
function grid(count: number, startDow = 0, size = 40): CellBox[] {
  return Array.from({ length: count }, (_, i) => {
    const slot = startDow + i;
    return {
      key: i + 1,
      left: 20 + (slot % 7) * (size + 4),
      top: 140 + Math.floor(slot / 7) * (size + 6),
      width: size,
      height: size
    };
  });
}

describe('the strip opening into the month', () => {
  it('starts every day where it stood and at the size it was', () => {
    const steps = regroupSteps(ribbon(30), grid(30));
    expect(steps).toHaveLength(30);
    const first = steps[0];
    expect(first.dx).toBe(0);
    expect(first.dy).toBe(-40);
    expect(first.sx).toBeCloseTo(0.2);
    expect(first.sy).toBeCloseTo(0.6);
  });

  it('leaves a day the change did not move alone', () => {
    const before = grid(30);
    const after = grid(30);
    expect(regroupSteps(before, after)).toHaveLength(0);
  });

  it('ignores a day that is only on one side of the change', () => {
    const before = ribbon(31);
    const after = grid(30);
    const steps = regroupSteps(before, after);
    expect(steps.map((s) => s.key)).not.toContain(31);
    expect(steps).toHaveLength(30);
  });

  it('reverses cleanly, so closing is the same travel the other way', () => {
    const open = regroupSteps(ribbon(30), grid(30));
    const shut = regroupSteps(grid(30), ribbon(30));
    expect(shut[0].dy).toBe(-open[0].dy);
    expect(shut[0].sx).toBeCloseTo(1 / open[0].sx);
  });

  /* Sub-pixel drift is what a fractional device pixel ratio leaves behind,
     and animating a cell 0.3px is a repaint that says nothing. */
  it('holds a cell still when nothing about it moved by a pixel', () => {
    const before = grid(30).map((c) => ({ ...c, left: c.left + 0.3, top: c.top - 0.2 }));
    expect(regroupSteps(before, grid(30))).toHaveLength(0);
  });

  it('keeps a cell that only changed size', () => {
    const before = grid(30, 0, 39.5);
    const steps = regroupSteps(before, grid(30, 0, 40));
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0].sx).toBeCloseTo(39.5 / 40);
  });

  /* A cell measured at zero has not been laid out - a display:none ancestor,
     or a measurement taken before the first frame - and dividing by it would
     hand WAAPI an Infinity. */
  it('drops a cell that was never laid out', () => {
    const before = ribbon(30).map((c, i) => (i === 0 ? { ...c, width: 0 } : c));
    const after = grid(30).map((c, i) => (i === 1 ? { ...c, height: 0 } : c));
    const steps = regroupSteps(before, after);
    expect(steps.map((s) => s.key)).not.toContain(1);
    expect(steps.map((s) => s.key)).not.toContain(2);
  });
});
