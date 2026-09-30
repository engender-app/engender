import { describe, expect, it } from 'vitest';
import { epochDayFromLocalDate } from '../data/epochDay';
import { dayStep, monthCells, monthKey, monthOfDay, parseIsoDate, rubberBand, settleStep } from './datePicker';

const day = (y: number, m: number, d: number) => epochDayFromLocalDate(new Date(y, m, d));

describe('monthCells', () => {
  it('is six Monday-first weeks, blank outside the month', () => {
    // October 2026 starts on a Thursday and has 31 days.
    const cells = monthCells(monthKey(2026, 9));
    expect(cells).toHaveLength(42);
    expect(cells.slice(0, 3)).toEqual([null, null, null]);
    expect(cells[3]).toBe(day(2026, 9, 1));
    expect(cells[33]).toBe(day(2026, 9, 31));
    expect(cells.slice(34).every((c) => c === null)).toBe(true);
  });

  it('starts on the first cell when the first is a Monday', () => {
    expect(monthCells(monthKey(2026, 5))[0]).toBe(day(2026, 5, 1));
  });

  it('knows a leap February', () => {
    const cells = monthCells(monthKey(2028, 1)).filter((c) => c !== null);
    expect(cells).toHaveLength(29);
  });
});

describe('monthOfDay', () => {
  it('is the key of the local month the day falls in', () => {
    expect(monthOfDay(day(2026, 0, 31))).toBe(monthKey(2026, 0));
    expect(monthOfDay(day(2026, 1, 1))).toBe(monthKey(2026, 1));
  });
});

describe('parseIsoDate', () => {
  it('reads a real yyyy-mm-dd day', () => {
    expect(parseIsoDate('2026-10-01')).toBe(day(2026, 9, 1));
    expect(parseIsoDate(' 2024-02-29 ')).toBe(day(2024, 1, 29));
  });

  it('refuses a day the calendar does not have, rather than rolling it over', () => {
    expect(parseIsoDate('2026-02-29')).toBeNull();
    expect(parseIsoDate('2026-13-01')).toBeNull();
    expect(parseIsoDate('2026-04-31')).toBeNull();
  });

  it('refuses anything that is not the one format', () => {
    for (const text of ['', '2026-1-01', '01.10.2026', '2026/10/01', '2026-10-01x']) {
      expect(parseIsoDate(text)).toBeNull();
    }
  });
});

describe('dayStep', () => {
  const at = day(2026, 0, 31);

  it('moves a day sideways and a week up or down', () => {
    expect(dayStep(at, 'ArrowRight', false)).toBe(day(2026, 1, 1));
    expect(dayStep(at, 'ArrowLeft', false)).toBe(day(2026, 0, 30));
    expect(dayStep(at, 'ArrowUp', false)).toBe(day(2026, 0, 24));
    expect(dayStep(at, 'ArrowDown', false)).toBe(day(2026, 1, 7));
  });

  it('moves a month on PageUp and PageDown, keeping the day inside the month', () => {
    expect(dayStep(at, 'PageDown', false)).toBe(day(2026, 1, 28));
    expect(dayStep(at, 'PageUp', false)).toBe(day(2025, 11, 31));
  });

  it('moves a year with Shift', () => {
    expect(dayStep(day(2028, 1, 29), 'PageDown', true)).toBe(day(2029, 1, 28));
    expect(dayStep(at, 'PageUp', true)).toBe(day(2025, 0, 31));
  });

  it('ignores every other key', () => {
    expect(dayStep(at, 'Enter', false)).toBeNull();
  });
});

describe('settleStep', () => {
  const width = 360;

  it('turns forward on a left drag past a quarter of the width', () => {
    expect(settleStep(-100, 0, width, true, true)).toBe(1);
    expect(settleStep(100, 0, width, true, true)).toBe(-1);
  });

  it('springs back under the threshold', () => {
    expect(settleStep(-60, 0, width, true, true)).toBe(0);
  });

  it('turns on a flick that is short but fast', () => {
    expect(settleStep(-30, -0.6, width, true, true)).toBe(1);
  });

  it('does not turn on a flick back towards the start', () => {
    expect(settleStep(-100, 0.6, width, true, true)).toBe(0);
  });

  it('never turns past a bound', () => {
    expect(settleStep(-200, -1, width, true, false)).toBe(0);
    expect(settleStep(200, 1, width, false, true)).toBe(0);
  });
});

describe('rubberBand', () => {
  it('gives ground ever more slowly, and never a whole width', () => {
    const w = 360;
    const a = rubberBand(60, w);
    const b = rubberBand(120, w);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(60);
    expect(b - a).toBeLessThan(a);
    expect(rubberBand(10_000, w)).toBeLessThan(w);
    expect(rubberBand(-60, w)).toBe(-a);
  });
});
