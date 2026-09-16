/* Every day of one year, a row per month, shaded at its step.

   It was `moodYear`: the same calendar walk with mood's own five steps
   baked in, drawn as a face per day - 365 svgs on one screen. Phase 11
   ticket 07 made the year twelve shaded rows on the active scale's own
   ramp, so the step function is the caller's now: mood hands in
   `moodStep`, any other scale `heatLevel` over its range, and this module
   only walks the calendar.

   The arithmetic is here rather than in the component because the awkward
   parts are calendar rules: how long each month is, and what a leap year
   does to February's row. */

import { epochDayFromLocalDate } from '../data/epochDay';

export interface YearCell {
  epochDay: number;
  /** 0 to 11 - which row. */
  month: number;
  /** 1 to 31 - which column. */
  dayOfMonth: number;
  /** The day's value on the caller's own steps, or 0 for a day that
      carried none. A day with nothing logged is not a day at the bottom of
      the scale. */
  step: number;
  /** The day's average before stepping, for the cell's own label. */
  value: number | null;
}

export interface YearRows {
  cells: YearCell[];
  /** Twelve, one per month, so the grid can draw its row labels without
      re-deriving them. */
  months: number[];
  /** 31 - the widest month. Short months simply have fewer cells in their
      row, which is a true thing about February and not a gap to fill. */
  columns: number;
}

/** The widest a month gets, and so how many columns the grid has. */
const YEAR_COLUMNS = 31;

/** `days` is the day-average series the stats seam answers; days it does
    not mention are cells at step 0, which is the state most of a year is
    in for most people and the one the grid has to draw honestly. */
export function yearRows(
  year: number,
  days: readonly { day: number; value: number }[],
  stepOf: (value: number) => number
): YearRows {
  const byDay = new Map(days.map((d) => [d.day, d.value]));
  const cells: YearCell[] = [];

  for (let month = 0; month < 12; month++) {
    const length = new Date(year, month + 1, 0).getDate();
    for (let dayOfMonth = 1; dayOfMonth <= length; dayOfMonth++) {
      const epochDay = epochDayFromLocalDate(new Date(year, month, dayOfMonth));
      const value = byDay.get(epochDay) ?? null;
      cells.push({ epochDay, month, dayOfMonth, value, step: value === null ? 0 : stepOf(value) });
    }
  }

  return { cells, months: Array.from({ length: 12 }, (_, month) => month), columns: YEAR_COLUMNS };
}
