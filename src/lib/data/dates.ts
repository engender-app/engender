/* The paraglide binding module: it's the one place that calls getLocale()
   and turns what epochDay.ts computes into localized display strings. Not
   a pass-through for epochDay.ts — it imports paraglide, which is why it
   has no Node-tier tests (ADR-0016) and why the split exists at all. */

import { getLocale } from '$lib/paraglide/runtime';
import { m } from '$lib/paraglide/messages';
import { localDateFromEpochDay } from './epochDay';
import type { CalendarDuration } from './epochDay';

export function intlLocale(): string {
  return getLocale() === 'pl' ? 'pl-PL' : 'en-GB';
}

export function fmtDay(epochDay: number, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(intlLocale(), opts).format(localDateFromEpochDay(epochDay));
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
    "1 year 3 months", "5 months", or "12 days". */
export function fmtDuration(d: CalendarDuration): string {
  if (d.years > 0) return d.months > 0 ? `${m.n_years({ n: d.years })} ${m.n_months({ n: d.months })}` : m.n_years({ n: d.years });
  if (d.months > 0) return m.n_months({ n: d.months });
  return m.n_days({ n: d.days });
}
