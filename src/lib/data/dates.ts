import { getLocale } from '$lib/paraglide/runtime';
import { DAY, todayEpochDay, epochDayFromLocalDate, localDateFromEpochDay } from './epochDay';

export { DAY, todayEpochDay, epochDayFromLocalDate, localDateFromEpochDay };

export function intlLocale(): string {
  return getLocale() === 'pl' ? 'pl-PL' : 'en-GB';
}

export function fmtDay(
  epochDay: number,
  opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }
): string {
  return new Intl.DateTimeFormat(intlLocale(), opts).format(localDateFromEpochDay(epochDay));
}

export function fmtTime(ts: number): string {
  return new Intl.DateTimeFormat(intlLocale(), { hour: 'numeric', minute: '2-digit' }).format(new Date(ts));
}
