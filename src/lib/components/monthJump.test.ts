import { describe, expect, it } from 'vitest';
import { epochDayFromLocalDate } from '../data/epochDay';
import { entryMonths, monthStep, yearBounds } from './monthJump';

const day = (y: number, m: number, d: number) => epochDayFromLocalDate(new Date(y, m, d));

describe('yearBounds', () => {
  it('runs from the first of January to the last of December', () => {
    expect(yearBounds(2026)).toEqual({ first: day(2026, 0, 1), last: day(2026, 11, 31) });
  });
});

describe('entryMonths', () => {
  it('names each month a day with entries falls in, once', () => {
    const months = entryMonths([day(2026, 0, 3), day(2026, 0, 30), day(2026, 11, 31)]);
    expect([...months].sort((a, b) => a - b)).toEqual([0, 11]);
  });

  it('is empty for a year with nothing in it', () => {
    expect(entryMonths([]).size).toBe(0);
  });
});

describe('monthStep', () => {
  it('moves one month sideways', () => {
    expect(monthStep('ArrowRight', 4, 4)).toBe(5);
    expect(monthStep('ArrowLeft', 4, 4)).toBe(3);
  });

  /* A row is however many columns the sheet had room for: four at 390px,
     three at 200% zoom. */
  it('moves a whole row up or down', () => {
    expect(monthStep('ArrowDown', 1, 4)).toBe(5);
    expect(monthStep('ArrowDown', 1, 3)).toBe(4);
    expect(monthStep('ArrowUp', 5, 4)).toBe(1);
  });

  it('runs to either end of the year', () => {
    expect(monthStep('Home', 7, 4)).toBe(0);
    expect(monthStep('End', 2, 4)).toBe(11);
  });

  /* The year is the stepper's job, not the arrows': walking off the grid
     stays put rather than wrapping into a month of the same year. */
  it('goes nowhere past the edge of the year', () => {
    expect(monthStep('ArrowLeft', 0, 4)).toBeNull();
    expect(monthStep('ArrowRight', 11, 4)).toBeNull();
    expect(monthStep('ArrowDown', 10, 4)).toBeNull();
    expect(monthStep('ArrowUp', 2, 4)).toBeNull();
  });

  it('leaves every other key alone', () => {
    expect(monthStep('Enter', 3, 4)).toBeNull();
    expect(monthStep('a', 3, 4)).toBeNull();
  });
});
