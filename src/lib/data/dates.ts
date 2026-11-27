/* The paraglide binding module: it's the one place that calls getLocale()
   and turns what epochDay.ts computes into localized display strings. Not
   a pass-through for epochDay.ts — it imports paraglide, which is why it
   has no Node-tier tests (ADR-0016) and why the split exists at all. */

import { formatNumber } from './numbers';
import { getLocale } from '$lib/paraglide/runtime';
import { m } from '$lib/paraglide/messages';
import { calendarDuration, crossesCalendarYear, durationParts, localDateFromEpochDay } from './epochDay';
import type { CalendarDuration, DurationUnit } from './epochDay';

export function intlLocale(): string {
  return getLocale() === 'pl' ? 'pl-PL' : 'en-GB';
}

export function fmtNumber(value: number, options: Intl.NumberFormatOptions = {}): string {
  return formatNumber(value, intlLocale(), options);
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const locale = intlLocale();
  const key = JSON.stringify([locale, Object.entries(opts).sort(([a], [b]) => a.localeCompare(b))]);
  let result = formatters.get(key);
  if (!result) {
    result = new Intl.DateTimeFormat(locale, opts);
    formatters.set(key, result);
  }
  return result;
}

export function fmtDay(epochDay: number, opts: Intl.DateTimeFormatOptions): string {
  return formatter(opts).format(localDateFromEpochDay(epochDay));
}

/** A day the person picked or typed, written the way the rest of the app
    writes a date: "3 Oct 2026", "3 paź 2026". Date fields and the search
    filter chips both show this, so a field
    never holds `2026-10-03` while the row under it says "3 Oct" (after-release
    28, audit V12/UI-08/L08-10). The `yyyy-mm-dd` stays the stored value and
    the picker's typed-entry format; it is just not what a person reads. */
export function fmtDateValue(epochDay: number): string {
  return fmtDay(epochDay, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A day card's bar: "Monday 5 October", with the year only when the day
    is not in this one ("Saturday 5 September 2025"). The calendar, the
    entry lists (search, Good moments, a tryout) and On this day each wrote
    it their own way (after-release 28, audit UI-08); this is the one way. */
export function fmtDayBar(epochDay: number, todayEpochDay: number): string {
  return fmtDay(epochDay, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(crossesCalendarYear(epochDay, todayEpochDay) ? { year: 'numeric' } : {})
  });
}

/** Label the chart endpoints with day and short month. If the range
    crosses a calendar year, include the year at both ends so the dates
    read in order. */
export function fmtRangeEnds(fromEpochDay: number, toEpochDay: number): { from: string; to: string } {
  const opts: Intl.DateTimeFormatOptions = crossesCalendarYear(fromEpochDay, toEpochDay)
    ? { day: 'numeric', month: 'short', year: 'numeric' }
    : { day: 'numeric', month: 'short' };
  return { from: fmtDay(fromEpochDay, opts), to: fmtDay(toEpochDay, opts) };
}

export function fmtTime(ts: number): string {
  return formatter({ hour: 'numeric', minute: '2-digit' }).format(new Date(ts));
}

/** "Jun 2026": a photograph's caption, and a search hit's place in time.
    The year whole, because "Jun 26" reads as the 26th of June (release
    audit U12). */
export function photoCaptionDate(epochDay: number): string {
  return fmtDay(epochDay, { month: 'short', year: 'numeric' });
}

export function fmtMonthName(year: number, month: number): string {
  return formatter({ month: 'long' }).format(new Date(year, month, 1));
}

export function fmtMonthYear(year: number, month: number): string {
  return formatter({ month: 'long', year: 'numeric' }).format(new Date(year, month, 1));
}

/** The largest one or two units of a CalendarDuration, in words: "2 years",
    "1 year 3 months", "5 months", or "12 days".

    Which units those are is `durationParts`' decision, not this function's -
    a sealed letter's card draws the same parts as numbers on blocks and the two must agree. This is only the rendering. */
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

/** How far apart two compared things were made: "2 months apart", or
    "Same day" for two on one day, where the span would read "0 days apart"
    (bug session 18, item 63). Progress photos and voice benchmarks both
    label a compared pair with it. */
export function fmtApart(fromEpochDay: number, toEpochDay: number): string {
  if (fromEpochDay === toEpochDay) return m.same_day();
  return `${fmtDuration(calendarDuration(fromEpochDay, toEpochDay))} ${m.apart_suffix()}`;
}
