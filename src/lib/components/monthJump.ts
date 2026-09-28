/* The arithmetic under the Journal's month picker (ticket 281), kept out of
   MonthJump.svelte so the node tier can hold it: which months of a year
   have entries, and where an arrow key takes the cursor. */
import { epochDayFromLocalDate, localDateFromEpochDay } from '../data/epochDay';

/** A year as the two epoch days the day-count read is bounded by. */
export function yearBounds(year: number): { first: number; last: number } {
  return {
    first: epochDayFromLocalDate(new Date(year, 0, 1)),
    last: epochDayFromLocalDate(new Date(year, 11, 31))
  };
}

/** The months (0-11) the given epoch days fall in. One year's days at a
    time, so the month alone says which cell carries the dot. */
export function entryMonths(days: number[]): Set<number> {
  return new Set(days.map((d) => localDateFromEpochDay(d).getMonth()));
}

/** Where a key moves the cursor from `index`, on a grid `columns` wide, or
    null if the key is not a move or the move leaves the year. The grid
    does not wrap: the year is the stepper's to change, and an arrow that
    ran from December into January would land on a month eleven months
    back rather than one forward. */
export function monthStep(key: string, index: number, columns: number): number | null {
  const to =
    key === 'ArrowRight' ? index + 1
    : key === 'ArrowLeft' ? index - 1
    : key === 'ArrowDown' ? index + columns
    : key === 'ArrowUp' ? index - columns
    : key === 'Home' ? 0
    : key === 'End' ? 11
    : null;
  return to === null || to < 0 || to > 11 ? null : to;
}
