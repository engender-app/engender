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

import type { ChartAnnotation } from '../charts/annotations';
import { dateInputValueFromEpochDay, localDateFromEpochDay, epochDayFromLocalDate } from './epochDay';
import type { EraSpan, JournalBounds } from './eras';
import { spanOverlapsRange } from './span';
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

/** The last `DEFAULT_SPAN_DAYS` ending on a day, or the whole rail where the
    rail is shorter than that.

    The day is today when the door opens, which is what this was written
    for, and the day of a mark when somebody taps one (ticket 06): a mark is
    one day and one day is not a reading, so pointing at one asks for the
    same window the door itself opens on, ending there. */
export function defaultSpan(railStart: number, endEpochDay: number): Span {
  return { start: Math.max(railStart, endEpochDay - DEFAULT_SPAN_DAYS + 1), end: endEpochDay };
}

/** How many days one step of a handle covers, from how many pixels a day
    is worth where the handle is.

    A rail of years drawn across a phone leaves a day at a fraction of a
    pixel, so a handle that moved by the day would move by whatever the
    finger's jitter rounded to. Days where a day is three pixels or more,
    weeks where a week is, months elsewhere: each is the finest step a
    person can still place by eye at that density. The scale below is not
    linear, so the answer is asked per place on the rail rather than once
    for its length. */
export function grainAt(pxPerDay: number): 1 | 7 | 30 {
  if (pxPerDay >= 3) return 1;
  if (pxPerDay * 7 >= 3) return 7;
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

/** A day's place along the rail, 0 at the start and 1 today.

    A square-root scale, not a linear one: position is 1 minus the square
    root of how far back the day is as a share of the whole rail. On a
    six-year history that gives the last month about an eighth of the
    width and the last year about two fifths, where a linear rail would
    give the month a sliver five pixels wide and put both handles on top
    of each other at the door's default span. The compression is honest
    in the way a ruler is honest: the year ticks are drawn where the years
    fall, so the rail says how it is stretched. A rail one day long has
    nowhere to place anything but its end. */
export function railPosition(day: number, railStart: number, todayEpochDay: number): number {
  const length = todayEpochDay - railStart;
  if (length <= 0) return 1;
  const back = Math.min(length, Math.max(0, todayEpochDay - day));
  return 1 - Math.sqrt(back / length);
}

/** The inverse: the day under a position, rounded to a whole day and held
    to the rail. */
export function dayAtPosition(position: number, railStart: number, todayEpochDay: number): number {
  const clamped = Math.min(1, Math.max(0, position));
  const length = todayEpochDay - railStart;
  return Math.round(todayEpochDay - (1 - clamped) ** 2 * length);
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

/* ## The rest of the history (phase 11 ticket 06)

   The rail drew two of the five dated histories the journal holds - the
   eras as bands, the milestones as marks - and the reading people most want
   from this door, "my moods over the HRT episode", was a stretch it could
   not select. Three more record types carry a stretch (RegimenEpisode,
   Tryout, JournalingPause) and one carries a day (Procedure).

   None of them is read here. `journal/chartAnnotations.ts` is already the
   one query that asks every area what it has dated, and every one of these
   is already in its answer - so the rail asks it over its own two days and
   the functions below select. A fifth gatherer of dated history would have
   been a second place for "what happened between these days" to drift.

   What is deliberately dropped from that answer, and why: `milestone` and
   `era`, which the rail already draws its own way and would otherwise draw
   twice; `dosePause`, `appointment`, `finishedArea` and `suspendedArea`,
   which are things inside an episode or a day in a stream rather than
   stretches of the person's own history; `recovery`, which is a reading of
   a procedure (Home's own cutoff) rather than a stretch anybody lived
   through as its own thing - the surgery day is the fact, and it is drawn;
   and `journalingPause`, which this ticket drew as a third lane until the
   sign-off renders (Alicja, 2026-09-16: "lets remove pauses from the
   strip"). A break is the absence of a journal rather than a stretch of a
   life, three lanes plus the marks did not fit 52px legibly, and the two
   that stayed are the two somebody would actually want to read a span over.
   The chart's own annotation band still draws pauses where they explain a
   flat stretch, which is the reading they were always for. */

/** The two kinds of stretch the history layer draws under the eras. Not
    merged into one record type: `span.ts`'s header refuses that, and this
    keeps the refusal visible - a band knows which kind it is, and the rail
    draws three kinds of band without the three tables becoming one. */
export type RailHistoryKind = 'regimen' | 'tryout';

/** The lanes, bottom-up, and the order the legend names them in. Fixed
    rather than derived from what the journal happens to hold, so a person
    who starts a tryout does not find the regimen in a different place
    afterwards. */
const HISTORY_ORDER: readonly RailHistoryKind[] = ['regimen', 'tryout'];

/** One stretch on the rail, already clamped to it. `openStart`/`openEnd`
    carry the same meaning `EraBand` gives them: the band runs off the end
    of the rail rather than ending there, so the edge is not drawn. */
export interface RailBand {
  id: string;
  kind: RailHistoryKind;
  /** An episode's drug, a tryout's label. The query types it nullable
      because a journaling pause has no name of its own; neither kind drawn
      here is that one, so the rail falls back to the kind's own word rather
      than drawing an unnamed band. */
  name: string | null;
  start: number;
  end: number;
  openStart: boolean;
  openEnd: boolean;
}

/** One dated point on the rail that is not a milestone: a procedure's
    surgery day. */
export interface RailMark {
  id: string;
  name: string | null;
  epochDay: number;
}

/** What the legend can name. `era` and `surgery` are not band kinds - the
    eras are the rail's own top layer and a procedure is a mark - but the
    legend names what the rail draws rather than how it draws it. */
export type RailLegendKind = 'era' | RailHistoryKind | 'surgery';

const HISTORY_OF_ANNOTATION: Partial<Record<ChartAnnotation['kind'], RailHistoryKind>> = {
  regimen: 'regimen',
  tryout: 'tryout'
};

/** The two stretch kinds out of a range's annotations, in the order the
    query already sorted them (oldest first).

    `annotationsInRange` has done the clamping, so an episode that started
    before the rail arrives already cut to the rail's start and knowing that
    its own start fell outside - which is exactly the open edge a band
    draws. A stretch still running arrives reaching to today with
    `endsInRange` false, the same. */
export function historyBands(annotations: readonly ChartAnnotation[]): RailBand[] {
  const out: RailBand[] = [];
  for (const annotation of annotations) {
    const kind = HISTORY_OF_ANNOTATION[annotation.kind];
    if (!kind) continue;
    out.push({
      id: annotation.id,
      kind,
      name: annotation.name,
      start: annotation.fromEpochDay,
      end: annotation.toEpochDay,
      openStart: !annotation.startsInRange,
      openEnd: !annotation.endsInRange
    });
  }
  return out;
}

/** The surgery days out of the same answer. A procedure with no date yet
    never reaches here: the query drops it, because a record with no day has
    no day to mark. */
export function surgeryMarks(annotations: readonly ChartAnnotation[]): RailMark[] {
  const out: RailMark[] = [];
  for (const annotation of annotations) {
    if (annotation.kind !== 'surgery') continue;
    out.push({ id: annotation.id, name: annotation.name, epochDay: annotation.fromEpochDay });
  }
  return out;
}

/** Which history kinds this journal has anything of, in lane order. A kind
    with no band takes no lane, so a journal with only HRT gets one lane
    rather than one lane and two empty ones. */
export function historyKindsPresent(bands: readonly RailBand[]): RailHistoryKind[] {
  const present = new Set(bands.map((band) => band.kind));
  return HISTORY_ORDER.filter((kind) => present.has(kind));
}

/** What the legend names, in the rail's own order: the eras first, since
    they are the layer that stands up, then the lanes bottom-up, then the
    marks. Absent kinds are absent - a journal with no tryouts does not read
    "Tryouts". */
export function railLegendKinds(
  bands: readonly RailBand[],
  marks: readonly RailMark[],
  hasEras: boolean
): RailLegendKind[] {
  return [
    ...(hasEras ? (['era'] as const) : []),
    ...historyKindsPresent(bands),
    ...(marks.length ? (['surgery'] as const) : [])
  ];
}

/** The query string a span is read at on /wrapped/range: the same one the
    range picker's own two date fields write, so the two are one read. */
export function spanRangeQuery(span: Span): string {
  return wrappedRangeQuery('custom', {
    start: dateInputValueFromEpochDay(span.start),
    end: dateInputValueFromEpochDay(span.end)
  });
}

/** Whether a settled span (redesign ticket 48) is due the "name this
    stretch" offer, given the spans already handled - named or dismissed -
    this session. Never for a span overlapping one already handled, which is
    what keeps a handle nudged by a day, or a span narrowed inside the one
    just dismissed, from raising the offer again for what is substantially
    the same stretch. */
export function eraOfferDue(span: Span, handled: readonly Span[]): boolean {
  return !handled.some((h) => spanOverlapsRange({ startEpochDay: h.start, endEpochDay: h.end }, span.start, span.end));
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

/** The Look back door's active span across in-session visits and Back
    restoration (phase 11 ticket 32). Plain module memory, cleared on reload. */
let lastLookBackSpan: Span | null = null;

export function getLastLookBackSpan(): Span | null {
  return lastLookBackSpan;
}

export function setLastLookBackSpan(span: Span | null): void {
  lastLookBackSpan = span;
}
