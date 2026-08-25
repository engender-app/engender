/* The arbitrary range a wrapped can cover (phase 5 UX ticket 23, closing
   spec 07), which is what the deleted `/recap` screen used to own.

   Wrapped already covers the three completed calendar periods
   (wrapped.ts). This is the other half of the same question: a range
   somebody picked. The two stay apart because they are addressed
   differently - a cadence is a path segment, since /wrapped/month is one
   named thing at one URL, and a picked range is query parameters, since
   there are as many of them as there are pairs of dates.

   Nothing here reads the clock and nothing here reads the journal, the same
   rule wrapped.ts and epochDay.ts follow: today arrives as an argument and
   the answer is a pair of epoch days. Nothing here formats anything either -
   a range's name is written against the active locale by the screen, and a
   date is not a thing this file decides how to write. */

import {
  customInclusiveRange,
  epochDayFromDateInputValue,
  ongoingWindowRange,
  yearToDateRange
} from './epochDay';
import type { WrappedCadence } from './wrapped';

/** The named ranges, in the order the picker offers them.

    This is recap's own list, kept whole rather than trimmed, because spec 07
    is explicit that wrapped covers "what recap's period picker offered".
    Two of them - the previous month and the previous year - are the same
    periods two of wrapped's cadences already are, and they resolve to a
    cadence rather than to a range here: one period has one URL, and
    /wrapped/month is it. */
export const WRAPPED_RANGE_CHOICES = [
  'prevMonth',
  'prevYear',
  'd7',
  'd30',
  'd90',
  'ytd',
  'custom'
] as const;

export type WrappedRangeChoice = (typeof WRAPPED_RANGE_CHOICES)[number];

/** The choice a wrapped opens on when the range view is reached with no
    parameters: the widest of the rolling windows that is still a window
    rather than a calendar period. */
export const WRAPPED_RANGE_DEFAULT: WrappedRangeChoice = 'd30';

/** How many days each rolling window covers, inclusive of today. */
const WINDOW_DAYS: Partial<Record<WrappedRangeChoice, number>> = {
  d7: 7,
  d30: 30,
  d90: 90
};

export interface WrappedRange {
  /** Both ends inclusive, the way the recap seam takes a range. */
  start: number;
  end: number;
}

/* A date-input value as an epoch day, and nothing at all where it is not a
   date. epochDayFromDateInputValue answers null for the empty string and
   leaves anything else to its caller, which is right for a bound `<input
   type="date">` - the browser only ever puts a real date or nothing in one.
   A query parameter is not that: `?from=yesterday` reaches
   `new Date(NaN, NaN, NaN)` and comes back NaN, which passes every null
   check on the way to a range whose two ends are NaN and a recap query
   asked about it. */
function datedEpochDay(value: string): number | null {
  const day = epochDayFromDateInputValue(value);
  return day === null || !Number.isFinite(day) ? null : day;
}

/** The cadence a named choice is really asking for, where one of them is.

    The previous month and the previous year are periods wrapped already
    has screens for, so the picker sends the person there instead of drawing
    the same period a second way at a different URL. */
export function wrappedRangeCadence(choice: WrappedRangeChoice): WrappedCadence | null {
  if (choice === 'prevMonth') return 'month';
  if (choice === 'prevYear') return 'year';
  return null;
}

/** The range a choice covers, or null where it cannot be resolved.

    Null is a real answer rather than an error: a custom range with one
    boundary filled in, or an end past today, is what a half-finished form
    looks like, and the screen shows the picker rather than a wrapped. The
    two cadence-backed choices are null here too - they are a navigation,
    not a range, and `wrappedRangeCadence` is what answers for them. */
export function resolveWrappedRange(
  choice: WrappedRangeChoice,
  todayEpochDay: number,
  custom?: { start: string; end: string }
): WrappedRange | null {
  const days = WINDOW_DAYS[choice];
  if (days !== undefined) {
    const range = ongoingWindowRange(todayEpochDay, days);
    return { start: range.start, end: range.end };
  }
  if (choice === 'ytd') {
    const range = yearToDateRange(todayEpochDay);
    return { start: range.start, end: range.end };
  }
  if (choice !== 'custom') return null;
  const range = customInclusiveRange(datedEpochDay(custom?.start ?? ''), datedEpochDay(custom?.end ?? ''));
  if (!range || range.end > todayEpochDay) return null;
  return { start: range.start, end: range.end };
}

export interface WrappedRangeParams {
  choice: WrappedRangeChoice;
  /** Date-input values, kept as the strings the two `<input type="date">`
      fields bind to rather than as epoch days: an empty field is a state the
      picker has to be able to be in, and epoch day has no value for it. */
  customStart: string;
  customEnd: string;
  range: WrappedRange | null;
}

/** What a range wrapped's query parameters mean.

    The URL is the state, so a picked range survives a reload, a back
    gesture and a shared link, the same way a cadence does. Anything the URL
    cannot be trusted to hold - a choice this build does not know, a date
    that is not a date - falls back to the default window rather than
    throwing: these arrive from a bookmark or an older build. */
export function parseWrappedRangeParams(
  named: string | null,
  from: string | null,
  to: string | null,
  todayEpochDay: number
): WrappedRangeParams {
  const customStart = from ?? '';
  const customEnd = to ?? '';
  const dated = datedEpochDay(customStart) !== null || datedEpochDay(customEnd) !== null;
  const choice: WrappedRangeChoice = (WRAPPED_RANGE_CHOICES as readonly string[]).includes(named ?? '')
    ? (named as WrappedRangeChoice)
    : dated
      ? 'custom'
      : WRAPPED_RANGE_DEFAULT;
  return {
    choice,
    customStart,
    customEnd,
    range: resolveWrappedRange(choice, todayEpochDay, { start: customStart, end: customEnd })
  };
}

/** The query string a choice is addressed by, so the picker and the URL
    agree in one place rather than at every call site. */
export function wrappedRangeQuery(
  choice: WrappedRangeChoice,
  custom?: { start: string; end: string }
): string {
  if (choice === 'custom') {
    const params = new URLSearchParams({ named: 'custom' });
    if (custom?.start) params.set('from', custom.start);
    if (custom?.end) params.set('to', custom.end);
    return `?${params}`;
  }
  return `?named=${choice}`;
}
