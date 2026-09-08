/* The span the Look back door's timeline selects (phase 10 redesign ticket
   11), and the rail it is selected on.

   The door opens on the person's own history: a rail from the earliest day
   they authored anything dated to today, with their eras as bands and their
   milestones as marks, and two handles that bound the stretch the
   retrospectives read. Everything about that rail that is arithmetic lives
   here, where it can be checked without a browser - where the rail starts,
   how far a handle moves per step, what a pointed-at day snaps to, and the
   URL a span is read at. The component draws; it decides nothing.

   Nothing here reads the clock or the journal, the same rule wrappedRange.ts
   and epochDay.ts follow: today and the journal's own facts arrive as
   arguments and the answers are epoch days.

   The span is handed to /wrapped/range through `wrappedRangeQuery`, the
   same function the range picker's own form writes its URL with. That is
   what makes "pointing at a span" and "typing the two dates into the
   picker" one read rather than two: the picker and the timeline produce
   the same query string for the same two days, and the test beside this
   file parses it back through `parseWrappedRangeParams` to prove it. */

import { dateInputValueFromEpochDay, localDateFromEpochDay, epochDayFromLocalDate } from './epochDay';
import type { EraSpan, JournalBounds } from './eras';
import { wrappedRangeQuery } from './wrappedRange';

/** Both ends inclusive, the way `recap(from, to)` takes a range. */
export interface Span {
  start: number;
  end: number;
}

export type SpanHandle = 'start' | 'end';

/** How many days the door opens on: wrapped's own default window
    (`WRAPPED_RANGE_DEFAULT` is `d30`), so the charts under the timeline
    read what the range view would have read before a finger touched it. */
export const DEFAULT_SPAN_DAYS = 30;

/** Where the rail begins: the earliest day the person authored anything
    dated, rather than the earliest day they logged. An entry's own day (the
    journal's bounds already skip the trash), a milestone's day, an era's
    start. A milestone still ahead is not history, and an era with no start
    reaches back before the journal rather than to a day, so neither moves
    the edge. Null where nothing dated exists yet: the door has an empty
    state for that, and a rail from today to today is not it. */
export function historyStart(
  input: {
    bounds: JournalBounds | null;
    milestones: readonly { epochDay: number }[];
    eras: readonly EraSpan[];
  },
  todayEpochDay: number
): number | null {
  const days: number[] = [];
  if (input.bounds) days.push(input.bounds.firstEpochDay);
  for (const milestone of input.milestones) if (milestone.epochDay <= todayEpochDay) days.push(milestone.epochDay);
  for (const era of input.eras) if (era.startEpochDay !== null) days.push(era.startEpochDay);
  if (!days.length) return null;
  return Math.min(todayEpochDay, ...days);
}

/** The last `DEFAULT_SPAN_DAYS` ending today, or the whole rail where the
    rail is shorter than that. */
export function defaultSpan(railStart: number, todayEpochDay: number): Span {
  return { start: Math.max(railStart, todayEpochDay - DEFAULT_SPAN_DAYS + 1), end: todayEpochDay };
}

/** How many days one step of a handle covers, by how long the rail is.

    A rail of years drawn across a phone leaves a day at a fraction of a
    pixel, so a handle that moved by the day would move by whatever the
    finger's jitter rounded to. Days up to four months, weeks up to two
    years, months beyond: each is the coarsest step a person can still
    place on the rail by eye at that length, and the week and month quick
    picks cover the recent cases the coarse steps cannot reach. */
export function spanGrain(railDays: number): 1 | 7 | 30 {
  if (railDays <= 120) return 1;
  if (railDays <= 730) return 7;
  return 30;
}

/** Where a pointed-at day lands.

    A magnet within tolerance wins: a milestone's day, an era's edge, the
    first entry - the days the rail already draws, which is what "point at a
    span" means when a finger is near one. Otherwise the day snaps to the
    grain, counted back from today so today itself is always reachable and
    the steps are the same wherever the rail happens to start. Never off
    either end of the rail. */
export function snapDay(
  day: number,
  rail: { start: number; today: number; grain: number; magnets: readonly number[]; toleranceDays: number }
): number {
  const clamp = (d: number) => Math.min(rail.today, Math.max(rail.start, d));
  let nearest: number | null = null;
  for (const magnet of rail.magnets) {
    if (Math.abs(magnet - day) > rail.toleranceDays) continue;
    if (nearest === null || Math.abs(magnet - day) < Math.abs(nearest - day)) nearest = magnet;
  }
  if (nearest !== null) return clamp(nearest);
  const back = Math.round((rail.today - day) / rail.grain) * rail.grain;
  return clamp(rail.today - back);
}

/** A day's place along the rail, 0 at the start and 1 today. A rail one day
    long has nowhere to place anything but its end. */
export function railPosition(day: number, railStart: number, todayEpochDay: number): number {
  const length = todayEpochDay - railStart;
  if (length <= 0) return 1;
  return Math.min(1, Math.max(0, (day - railStart) / length));
}

/** The inverse: the day under a position, rounded to a whole day and held
    to the rail. */
export function dayAtPosition(position: number, railStart: number, todayEpochDay: number): number {
  const clamped = Math.min(1, Math.max(0, position));
  return Math.round(railStart + clamped * (todayEpochDay - railStart));
}

/** A handle moved to a day, without ever crossing the other one: a span is
    two days in order, and a start dragged past the end stops at it. */
export function moveHandle(span: Span, handle: SpanHandle, day: number): Span {
  if (handle === 'start') return { start: Math.min(day, span.end), end: span.end };
  return { start: span.start, end: Math.max(day, span.start) };
}

/** Which handle a tap on the rail moves: the nearer one, and the end when
    the tap is exactly between them, since extending towards today is the
    more usual wish. */
export function nearestHandle(span: Span, day: number): SpanHandle {
  return Math.abs(day - span.start) < Math.abs(day - span.end) ? 'start' : 'end';
}

export interface EraBand {
  id: string;
  name: string;
  start: number;
  end: number;
  /** The era reaches back before the journal (ADR-0049); the band runs to
      the rail's start and says so with an open edge. */
  openStart: boolean;
  /** The era is still running; the band runs to today. */
  openEnd: boolean;
}

/** The eras as bands on the rail, clamped to it. An era wholly ahead of
    today draws nothing: the rail is what is behind the person. */
export function eraBands(
  eras: readonly (EraSpan & { id: string })[],
  railStart: number,
  todayEpochDay: number
): EraBand[] {
  const out: EraBand[] = [];
  for (const era of eras) {
    if (era.startEpochDay !== null && era.startEpochDay > todayEpochDay) continue;
    const start = Math.max(railStart, era.startEpochDay ?? railStart);
    const end = Math.min(todayEpochDay, era.endEpochDay ?? todayEpochDay);
    if (end < start) continue;
    out.push({
      id: era.id,
      name: era.name,
      start,
      end,
      openStart: era.startEpochDay === null,
      openEnd: era.endEpochDay === null
    });
  }
  return out;
}

/** The query string a span is read at on /wrapped/range: the same one the
    range picker's own two date fields write, so the two are one read. */
export function spanRangeQuery(span: Span): string {
  return wrappedRangeQuery('custom', {
    start: dateInputValueFromEpochDay(span.start),
    end: dateInputValueFromEpochDay(span.end)
  });
}

/** Each 1 January strictly after the rail's start and no later than today:
    the marks a rail of years is read by. */
export function yearTicks(railStart: number, todayEpochDay: number): { epochDay: number; year: number }[] {
  const out: { epochDay: number; year: number }[] = [];
  const first = localDateFromEpochDay(railStart).getFullYear() + 1;
  const last = localDateFromEpochDay(todayEpochDay).getFullYear();
  for (let year = first; year <= last; year++) {
    const epochDay = epochDayFromLocalDate(new Date(year, 0, 1));
    if (epochDay > railStart && epochDay <= todayEpochDay) out.push({ epochDay, year });
  }
  return out;
}
