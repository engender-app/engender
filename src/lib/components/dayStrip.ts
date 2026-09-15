/* A schedule read a week at a time (phase 10 redesign ticket 44).

   Dilation and wear both drew a row per day - dilation one for every day
   `expectedSessionDays` put a session on, which is nearly all of them, for
   a taper that runs months. The app had already made this argument about
   the calendar: `DAY_AHEAD_OPT_OUTS` refuses the taper a mark because an
   expected session on nearly every day is not information. A row on nearly
   every day is not information either.

   So the week is the unit, and this module is the arithmetic both screens
   share: which seven days a page shows, what each of them is, and how far
   back there is anything to page to. What a day *means* stays with the
   screen - one asks a taper schedule, the other asks whether a session was
   logged - and arrives here as a `DayMark`.

   The three marks and nothing else, because a fourth would be a scale:

     logged    something was logged that day
     expected  the schedule called for one and nothing was logged
     off       the schedule called for nothing

   `expected` and `off` differ by their outline alone and never by colour
   (ADR-0012: nothing here grades a day, and a run of empty days is not a
   failure to be shaded). `stripCellOf` is what holds the two screens to
   that - it is the only place the three marks turn into paint.

   No `$lib` imports and no messages: the Node tier that runs this module's
   test has no alias to resolve, and the words belong to the screens. */

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
