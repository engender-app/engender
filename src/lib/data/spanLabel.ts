/* The span written out with its length, the way the rail's own state line
   says it (SpanTimeline.svelte, ticket 06): "18 Aug to 16 Sept, 30 days".
   Years only where they carry information - the start's when it is not
   this year, the end's when it is not this year either. Here rather than
   on the door so a reading's screen can write the same line under its
   title (phase 11 ticket 07). */
import { m } from '$lib/paraglide/messages';
import { fmtDay } from './dates';
import { localDateFromEpochDay } from './epochDay';
import type { Span } from './lookBackSpan';

const dayWithYear = (day: number, year: number) =>
  fmtDay(
    day,
    localDateFromEpochDay(day).getFullYear() === year
      ? { day: 'numeric', month: 'short' }
      : { day: 'numeric', month: 'short', year: 'numeric' }
  );

/** One day in the same words the span line writes its two ends in: the
    year only where it is not this one. A list that holds both stretches
    and days (SpanFacts.svelte) says them one way rather than two. */
export function dayLabel(day: number, todayEpochDay: number): string {
  return dayWithYear(day, localDateFromEpochDay(todayEpochDay).getFullYear());
}

export function spanLabel(span: Span, todayEpochDay: number): string {
  const year = localDateFromEpochDay(todayEpochDay).getFullYear();
  const days = span.end - span.start + 1;
  return `${m.wrapped_week_range({ from: dayWithYear(span.start, year), to: dayWithYear(span.end, year) })}, ${m.n_days({ n: days })}`;
}
