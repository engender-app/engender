/* The paraglide binding module: it's the one place that calls getLocale()
   and turns what epochDay.ts computes into localized display strings. Not
   a pass-through for epochDay.ts — it imports paraglide, which is why it
   has no Node-tier tests (ADR-0016) and why the split exists at all. */

import { getLocale } from '$lib/paraglide/runtime';
import { m } from '$lib/paraglide/messages';
import { crossesCalendarYear, durationParts, localDateFromEpochDay } from './epochDay';
import type { CalendarDuration, DurationUnit } from './epochDay';

export function intlLocale(): string {
  return getLocale() === 'pl' ? 'pl-PL' : 'en-GB';
}

export function fmtDay(epochDay: number, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(intlLocale(), opts).format(localDateFromEpochDay(epochDay));
}

/** The two ends of a chart's range, written so they cannot read backwards.

    A gutter says what the ends of the scale are and nothing else
    (DIRECTION.md's chart rules: no axis furniture), so a day and a short
    month is all it needs - until the range crosses a year, at which point
    "22 Jun" on the left and "17 Jun" on the right is a chart that appears
    to run backwards. Found on the lab results screen (phase 5 UX ticket
    25), whose range is however long somebody has been having blood drawn
    rather than the fixed window the Stats hub plots.

    The year goes on both ends or neither: one dated end beside an undated
    one reads as the undated one being the current year, which is the same
    wrong reading in a quieter form. */
export function fmtRangeEnds(fromEpochDay: number, toEpochDay: number): { from: string; to: string } {
  const opts: Intl.DateTimeFormatOptions = crossesCalendarYear(fromEpochDay, toEpochDay)
    ? { day: 'numeric', month: 'short', year: 'numeric' }
    : { day: 'numeric', month: 'short' };
  return { from: fmtDay(fromEpochDay, opts), to: fmtDay(toEpochDay, opts) };
}

export function fmtTime(ts: number): string {
  return new Intl.DateTimeFormat(intlLocale(), { hour: 'numeric', minute: '2-digit' }).format(new Date(ts));
}

export function fmtMonthName(year: number, month: number): string {
  return new Intl.DateTimeFormat(intlLocale(), { month: 'long' }).format(new Date(year, month, 1));
}

export function fmtMonthYear(year: number, month: number): string {
  return new Intl.DateTimeFormat(intlLocale(), { month: 'long', year: 'numeric' }).format(new Date(year, month, 1));
}

/** The largest one or two units of a CalendarDuration, in words: "2 years",
    "1 year 3 months", "5 months", or "12 days".

    Which units those are is `durationParts`' decision, not this function's -
    a sealed letter's card draws the same parts as numbers on blocks (ticket
    45) and the two must agree. This is only the rendering. */
const DURATION_WORD: Record<DurationUnit, (n: number) => string> = {
  years: (n) => m.n_years({ n }),
  months: (n) => m.n_months({ n }),
  days: (n) => m.n_days({ n })
};

export function fmtDuration(d: CalendarDuration): string {
  return durationParts(d)
    .map((part) => DURATION_WORD[part.unit](part.n))
    .join(' ');
}
