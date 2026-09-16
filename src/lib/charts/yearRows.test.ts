import { describe, expect, it } from 'vitest';
import { yearRows } from './yearRows';
import { epochDayFromLocalDate } from '../data/epochDay';

const stepOf = (value: number) => Math.min(4, Math.max(1, Math.ceil(value / 25)));

describe('a year as twelve rows of days', () => {
  it('draws every day of the year, a row per month, February at its real length', () => {
    const grid = yearRows(2025, [], stepOf);
    expect(grid.months).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(grid.cells).toHaveLength(365);
    expect(grid.cells.filter((cell) => cell.month === 1)).toHaveLength(28);
    expect(yearRows(2024, [], stepOf).cells).toHaveLength(366);
    expect(grid.columns).toBe(31);
  });

  it('shades a day at its value\'s step and leaves an unlogged day at step 0', () => {
    const june3 = epochDayFromLocalDate(new Date(2025, 5, 3));
    const grid = yearRows(2025, [{ day: june3, value: 80 }], stepOf);
    const cell = grid.cells.find((c) => c.epochDay === june3);
    expect(cell).toMatchObject({ month: 5, dayOfMonth: 3, value: 80, step: 4 });
    const june4 = grid.cells.find((c) => c.epochDay === june3 + 1);
    expect(june4).toMatchObject({ value: null, step: 0 });
  });
});
