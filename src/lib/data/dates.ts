import { getLocale } from '$lib/paraglide/runtime';

export const DAY = 86400000;

export function intlLocale(): string {
  return getLocale() === 'pl' ? 'pl-PL' : 'en-GB';
}

export function fmtDay(
  epochDay: number,
  opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }
): string {
  return new Intl.DateTimeFormat(intlLocale(), opts).format(new Date(epochDay * DAY));
}

export function fmtTime(ts: number): string {
  return new Intl.DateTimeFormat(intlLocale(), { hour: 'numeric', minute: '2-digit' }).format(new Date(ts));
}

export function epochDayFromISO(iso: string): number {
  return Math.floor(Date.parse(iso + 'T00:00Z') / DAY);
}

export function isoFromEpochDay(day: number): string {
  return new Date(day * DAY).toISOString().slice(0, 10);
}
