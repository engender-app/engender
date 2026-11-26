/* Dilation and wear share seven-day paging and cell paint through
   stripCellOf. The screen supplies each DayMark: logged for a saved
   session, expected for an unlogged scheduled session, off for no
   expectation. Expected and off differ only by outline (ADR-0012).
   Week pages avoid a row for nearly every day of a long taper, the
   same reason DAY_AHEAD_OPT_OUTS omits its calendar marks.

   Keep $lib aliases and localized strings in the screens so Node can
   test the paging and paint rules. */

/** Seven. A phone fits seven cells (kit.css's bare strip), and a week is
    the unit a person reads a schedule in. */
export const STRIP_DAYS = 7;

export type DayMark = 'logged' | 'expected' | 'off';

export interface StripWindow {
  /** Earliest day on the page, inclusive. */
  first: number;
  /** Latest day on the page, inclusive. */
  last: number;
}

export interface StripSlot {
  epochDay: number;
  mark: DayMark;
  isToday: boolean;
}

/** The seven days `weeksBack` pages before today, the current page ending
    on today itself rather than on a Sunday. A calendar week would put
    today somewhere in the middle of the first page and leave the days
    after it drawn but unanswerable - `expectedSessionDays` stops at today
    and nothing in this app says what a future day will hold. */
export function stripWindow(today: number, weeksBack: number): StripWindow {
  const last = today - weeksBack * STRIP_DAYS;
  return { first: last - (STRIP_DAYS - 1), last };
}

/** Every day of the window, earliest first, each asked what it is. */
export function stripSlots(
  window: StripWindow,
  today: number,
  markOf: (epochDay: number) => DayMark
): StripSlot[] {
  return Array.from({ length: window.last - window.first + 1 }, (_, index) => {
    const epochDay = window.first + index;
    return { epochDay, mark: markOf(epochDay), isToday: epochDay === today };
  });
}

/** How a mark is painted, in the bare strip's own two dimensions: `level`
    on the heat ramp, and whether the cell keeps its hairline at all. Two
    of the three levels, never a ramp across them - a logged day is filled
    and an empty one is not, and that is the whole scale. */
export function stripCellOf(mark: DayMark): { level: number; blank: boolean } {
  return { level: mark === 'logged' ? 4 : 0, blank: mark === 'off' };
}

/** Whether there is a page before this one. `earliest` is the first day
    the screen has anything to say about - a taper's start day, a journal's
    first session - and null when it has nothing at all. */
export function canPageBack(window: StripWindow, earliest: number | null): boolean {
  return earliest !== null && window.first > earliest;
}
