/* Every day of one year, on the mood ramp.

   The yearly wrapped drew twelve bars, one per month, which is where the
   shape went but not what the year was: "it should have a custom built
   component that shows all moods of every day of that year" (Alicja,
   2026-08-25). So the year is 365 cells, seven rows deep, one column per
   week - a shape you read in one look and can still find a single Tuesday
   in.

   The arithmetic is here rather than in the component because the awkward
   parts are calendar rules: how long each month is, and what a leap year
   does to February's row. */

import { epochDayFromLocalDate } from '../data/epochDay';
import { moodStep } from '../data/metricRange';

interface MoodCell {
  epochDay: number;
  /** 0 to 11 - which row. */
  month: number;
  /** 1 to 31 - which column. */
  dayOfMonth: number;
  /** The day's mood rounded to a step of the ramp, or null for a day that
      carried none. A day with nothing logged is not a day at zero. */
  step: number | null;
  /** The day's average before rounding, for the cell's own label. */
  value: number | null;
}

export interface MoodYear {
  cells: MoodCell[];
  /** Twelve, one per month, so the grid can draw its row labels without
      re-deriving them. */
  months: number[];
  /** 31 - the widest month. Short months simply have fewer cells in their
      row, which is a true thing about February and not a gap to fill. */
  columns: number;
}

/** The widest a month gets, and so how many columns the grid has. */
const MOOD_YEAR_COLUMNS = 31;

/** One year of days, a row per month, with whatever mood each carried.

    A row per month rather than a column per week, which is how this was
    first drawn: 53 columns of 5px cells overflowed a 390px card, and mood's
    own ramp has literal hex steps chosen to be sat on rather than to be
    5px dots - on the dark theme they are all dark, and at that size
    they had almost no separation from each other. Twelve rows of 31 gives a
    cell about 11px on the same card, which is enough area for a step to be a
    colour, and it reads as the year's calendar rather than as a heat map.

    `days` is the day-average series the stats seam answers; days it does not
    mention are cells with no step, which is the state most of a year is in
    for most people and the one the grid has to draw honestly. */
export function moodYear(year: number, days: { day: number; value: number }[]): MoodYear {
  const byDay = new Map(days.map((d) => [d.day, d.value]));
  const cells: MoodCell[] = [];

  for (let month = 0; month < 12; month++) {
    const length = new Date(year, month + 1, 0).getDate();
    for (let dayOfMonth = 1; dayOfMonth <= length; dayOfMonth++) {
      const epochDay = epochDayFromLocalDate(new Date(year, month, dayOfMonth));
      const value = byDay.get(epochDay) ?? null;
      cells.push({
        epochDay,
        month,
        dayOfMonth,
        value,
        step:
          value === null
            ? null
            : moodStep(value)
      });
    }
  }

  return { cells, months: Array.from({ length: 12 }, (_, month) => month), columns: MOOD_YEAR_COLUMNS };
}
