/* The arithmetic under DatePicker (phase 12 pickers, ticket 01), kept out of
   the components so the node tier can hold it: which day sits in which of a
   month's 42 cells, what a typed date means, where a key moves the cursor,
   and when a swipe turns the month.

   Days are epoch days (ADR-0001) and months are month keys, `year * 12 +
   month`, so a month step is `+ 1` and never a Date rolling over. */
import { epochDayFromLocalDate, localDateFromEpochDay } from '../data/epochDay';

export function monthKey(year: number, month: number): number {
  return year * 12 + month;
}

export function keyYear(key: number): number {
  return Math.floor(key / 12);
}

export function keyMonth(key: number): number {
  return key - keyYear(key) * 12;
}

export function monthOfDay(epochDay: number): number {
  const d = localDateFromEpochDay(epochDay);
  return monthKey(d.getFullYear(), d.getMonth());
}

function daysIn(key: number): number {
  return new Date(keyYear(key), keyMonth(key) + 1, 0).getDate();
}

/** A month as six Monday-first weeks, null where a cell falls outside it.
    Always six rows, so a four-week February and a six-week month are the
    same height and turning between them moves nothing under the grid. */
export function monthCells(key: number): (number | null)[] {
  const first = epochDayFromLocalDate(new Date(keyYear(key), keyMonth(key), 1));
  const lead = (new Date(keyYear(key), keyMonth(key), 1).getDay() + 6) % 7;
  const length = daysIn(key);
  return Array.from({ length: 42 }, (_, i) => {
    const n = i - lead;
    return n >= 0 && n < length ? first + n : null;
  });
}

/** A typed `yyyy-mm-dd` as an epoch day, or null. Strict: the text has to
    name a day the calendar has, so 2026-02-29 is refused rather than read
    as the first of March. */
export function parseIsoDate(text: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const [year, month, date] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  if (month > 11 || date < 1 || date > daysIn(monthKey(year, month))) return null;
  return epochDayFromLocalDate(new Date(year, month, date));
}

/** The same day of the month `months` away, pulled back to the month's last
    day where it has fewer. */
function shiftMonths(epochDay: number, months: number): number {
  const d = localDateFromEpochDay(epochDay);
  const key = monthKey(d.getFullYear(), d.getMonth()) + months;
  return epochDayFromLocalDate(new Date(keyYear(key), keyMonth(key), Math.min(d.getDate(), daysIn(key))));
}

/** Where a key moves the cursor, or null for a key that is not a move:
    arrows by a day or a week, PageUp/PageDown by a month, a year with
    Shift. Bounds are the caller's to apply. */
export function dayStep(epochDay: number, key: string, shift: boolean): number | null {
  switch (key) {
    case 'ArrowLeft': return epochDay - 1;
    case 'ArrowRight': return epochDay + 1;
    case 'ArrowUp': return epochDay - 7;
    case 'ArrowDown': return epochDay + 7;
    case 'PageUp': return shiftMonths(epochDay, shift ? -12 : -1);
    case 'PageDown': return shiftMonths(epochDay, shift ? 12 : 1);
    default: return null;
  }
}

/** How far a release has to have carried the grid to turn the month, as a
    share of its width, and how fast a short flick has to be going. */
const TURN_SHARE = 0.25;
const TURN_VELOCITY = 0.35; // px per ms
const FLICK_FLOOR = 8; // px: a tap that wobbled is not a flick

/** Which way a released drag settles: 1 is the next month (the grid went
    left), -1 the previous one, 0 back where it was. A flick in the opposite
    direction to the drag, or towards a bound, springs back. */
export function settleStep(dx: number, velocity: number, width: number, canBack: boolean, canForward: boolean): -1 | 0 | 1 {
  const far = Math.abs(dx) > width * TURN_SHARE;
  const flick = Math.abs(dx) > FLICK_FLOOR && Math.abs(velocity) > TURN_VELOCITY;
  const against = velocity !== 0 && Math.sign(velocity) !== Math.sign(dx) && Math.abs(velocity) > TURN_VELOCITY;
  if (!(far || flick) || against) return 0;
  if (dx < 0) return canForward ? 1 : 0;
  return canBack ? -1 : 0;
}

/** A drag past a bound, as the distance the grid actually travels: it gives
    ground ever more slowly and never a whole width, the stretch a scroll
    view has at its end. */
export function rubberBand(dx: number, width: number): number {
  const give = (1 - 1 / ((Math.abs(dx) * 0.55) / width + 1)) * width;
  return Math.sign(dx) * give;
}
