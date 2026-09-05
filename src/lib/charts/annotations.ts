/* What was happening around the numbers a chart draws (phase 5 deepening
   ticket 23, ADR-0001, ADR-0010).

   Every time chart in the app plots the person's own readings against a date
   axis and draws nothing else. A dysphoria line that dropped in March does
   not say that March is when the regimen started; a lab series does not say
   where the schedule was paused. Those dates are already stored, one table
   away from the chart, and before this each chart would have had to fetch
   and draw them itself.

   So: one selection rule here, one drawing layer in the kit
   (components/kit/ChartAnnotations.svelte), and a chart opts in by passing
   the annotations it wants. Two kinds of thing, because a moment and a
   stretch are not the same picture - a milestone is a day, a regimen episode
   is a period, and drawing the second as the first would be a lie about what
   the record holds.

   Descriptive throughout (PRODUCT.md:109). An annotation says what happened
   and when. Nothing here, and nothing the layer draws, says a reading moved
   because of it: there is no correlation, no ordering of cause, and no
   arithmetic that touches the plotted values at all. correlationCards.ts is
   a separate thing and this does not go near it.

   Pure, and above the journal seam the way milestoneStatus.ts and
   regimenEpisode.ts are: nothing here reads a clock or a database. `today`
   arrives as an argument because an unfinished episode reaches to today and
   the schema stores no end for it (ADR-0010). Node-tier safe, so it imports
   no paraglide: the words an annotation is written with live in
   components/kit/chartAnnotation.ts, the same split day.ts keeps from
   vocabulary/dayLabels.ts.

   ## Which charts take annotations, and which take none

   The ticket asks for this to be decided per chart rather than switched on
   everywhere, and for the ones that take nothing to be named with a reason.

   Taking them:

     /stats, the values chart      a scale over a date range, which is the
                                   case the ticket is written about
     /settings/labs, per analyte   "where did the schedule change" is the
                                   question a lab series is read with
     /body-map, both trajectories  a region's dysphoria and euphoria over a
                                   range, same shape as the values chart
     /tally, both counters         days on a date axis
     /practice/voice, the trend    benchmarks months apart, and a regimen
                                   episode is the thing they are read against

   Taking none:

     Safe Space's 30-day timeline  it is a crisis screen (ADR-0040). The
                                   window would clip out old milestones on
                                   its own, but the ones it would keep are
                                   the surgery dates and recovery windows of
                                   the last month, and a screen someone opens
                                   on a bad night is not where those should
                                   arrive unasked.
     /settings/hormone-curve       its x axis is hours since a dose, not a
                                   calendar. A date has no position on it,
                                   and its own dose marks already say what a
                                   chart there needs to say.
     /stats, interval mood         same reason: x is a position in the dosing
                                   interval.
     /settings/exposure            has no chart. Its counters are list rows.
     /body/measurements            a time chart, and it would fit - but it is
                                   not in this ticket's screen list, and
                                   wiring it here would be a decision taken
                                   in the wrong ticket. Named so the next
                                   person knows it was looked at.

   One thing the app stores dates for and this deliberately does not draw:
   entries themselves - every logged day would be an annotation, which is
   the line already on the chart. A consult used to be excluded for the same
   reason recorded here once, back when it lived only inside a procedure's
   own history; phase 8 features ticket 59 gave every appointment a row of
   its own (ADR-0066), and a consult is one of those rows, so it draws like
   any other appointment now. */

import type { EpisodeEndReason } from '../data/types';
import { spanOverlapsRange } from '../data/span';

/** The kinds of thing that get annotated, and nothing else: this draws dates
    the app already stores rather than introducing an event type of its own.

    `surgery` and `recovery` both come from one Procedure - the day, and the
    stretch after it - because a chart wants to show the operation and the
    weeks it was recovered through as two different marks.

    The last six are phase 8 features ticket 15's, and they are the hormone
    curve's alone - `getCurveMarkers` rather than `getAnnotations`
    (journal/chartAnnotations.ts), so no chart picks them up by having opted
    into annotations. They split finer than the record types behind them for
    one reason: a kind is the only thing a mark is worded from
    (kit/chartAnnotation.ts's KIND_WORD), and a tally that stood out on the
    misgendering counter means the opposite of one on the other. Same for a
    region's dysphoria against its euphoria.

    `tallyMisgendered`, `tallyCorrectlyGendered`, `bodyRegionDysphoria` and
    `bodyRegionEuphoria` are the days that stood out against the person's own
    recent spread and not every day with a count or a reading on it: the
    threshold, and the reason for it, are in data/ownSpread.ts.

    `finishedArea` is phase 8 features ticket 04's, and it is a point on the
    day somebody said a stream of theirs ended (ADR-0052). It belongs in
    `getAnnotations` rather than beside the six above, because that day is
    exactly what a flat stretch on any chart covering it needs explaining
    with: without it the reader cannot tell a practice that ended from a
    month nobody logged. Its `name` is the area's own key, resolved by
    kit/chartAnnotation.ts.

    `appointment` is phase 8 features ticket 59's (ADR-0066). One point per
    past appointment, named by the person's own kind where they typed one -
    the same rule `name` already follows everywhere else, so no fallback
    lives here. A consult is an appointment whose procedureId is set and
    carries no kind of its own here: it draws exactly like any other
    appointment, which is the point of it having stopped being a separate
    thing. */
export type ChartAnnotationKind =
  | 'milestone'
  | 'surgery'
  | 'regimen'
  | 'recovery'
  | 'dosePause'
  | 'journalingPause'
  | 'tryout'
  | 'era'
  | 'appointment'
  | 'sideEffect'
  | 'injection'
  | 'tallyMisgendered'
  | 'tallyCorrectlyGendered'
  | 'bodyRegionDysphoria'
  | 'bodyRegionEuphoria'
  | 'finishedArea'
  | 'suspendedArea';

/** Whether a kind is a moment or a stretch. Here rather than on each record,
    so no caller can hand in a milestone that claims to be a period.

    `era` is a point rather than a span (phase 6 ticket 03): the mark is the
    boundary an era's start draws, not the stretch itself - the calendar
    shades the stretch, and a chart would need a wash in every era's colour
    to do the same, which is a second mechanism the ticket rules out. */
const SHAPE: Record<ChartAnnotationKind, 'point' | 'span'> = {
  milestone: 'point',
  surgery: 'point',
  regimen: 'span',
  recovery: 'span',
  dosePause: 'span',
  journalingPause: 'span',
  tryout: 'span',
  era: 'point',
  appointment: 'point',
  sideEffect: 'point',
  injection: 'point',
  tallyMisgendered: 'point',
  tallyCorrectlyGendered: 'point',
  bodyRegionDysphoria: 'point',
  bodyRegionEuphoria: 'point',
  finishedArea: 'point',
  /* Phase 8 features ticket 51. A point, the same reason `finishedArea` is
     one: the day the pause started is what a flat stretch after it needs
     explaining with, not a stretch of its own - the app has no stored day
     the pause ended (that is what resuming clears, not sets). */
  suspendedArea: 'point'
};

/** One dated thing, as the query hands it over: stored days, untouched.

    `endEpochDay` is null on every point event, and on a stretch that has not
    finished - the same meaning `RegimenEpisode`, `DosePause`, `Tryout` and
    `JournalingPause` all give it in types.ts. */
export interface ChartAnnotationSource {
  id: string;
  kind: ChartAnnotationKind;
  /** What the record calls itself: a milestone's name, an episode's drug, a
      procedure's name, a tryout's label. Null where the record has no name
      of its own, which is a journaling pause. */
  name: string | null;
  startEpochDay: number;
  endEpochDay: number | null;
  /** Where the record this stands for is read, for a mark somebody can tap
      through (ticket 15). Absent on the seven kinds that had none: a
      journaling pause is a stretch nothing owns a screen for, and a milestone
      mark on a chart was never meant to be a way out of the chart. */
  href?: string;
  /** Which of a screen's several charts this belongs on, or absent for all
      of them (ticket 15).

      The hormone curve screen draws a chart per ester and a chart per
      illustrative shape, and each one is built from only the doses that
      resolve to it. An injection therefore belongs under exactly one of
      them, and a tick under a band that did not count that dose is the
      chart disagreeing with itself. Everything else on that screen - a side
      effect, a day that stood out - is about the person rather than about
      one drug, and belongs under all of them. */
  series?: string;
  /** Why a `regimen` episode ended (ticket 43). Absent on every other kind,
      and null on a `regimen` source that is still open or that ended
      before this ticket. */
  endReason?: EpisodeEndReason | null;
}

/** One annotation that falls inside the range asked for, clipped to it. */
export interface ChartAnnotation {
  id: string;
  kind: ChartAnnotationKind;
  name: string | null;
  shape: 'point' | 'span';
  /** Where it sits, clipped to the range. Equal on a point. */
  fromEpochDay: number;
  toEpochDay: number;
  /** Whether the day it really started on is inside the range, so the layer
      can tell an edge that belongs to the event from one that is only where
      the chart happens to begin. */
  startsInRange: boolean;
  /** The same for its end, and false for a stretch that has not ended: there
      is no day to draw an edge at. */
  endsInRange: boolean;
  /** The source's, carried through unchanged. */
  href?: string;
  /** The source's, carried through unchanged. */
  series?: string;
  /** The source's, carried through unchanged. */
  endReason?: EpisodeEndReason | null;
}

export interface AnnotationRange {
  from: number;
  to: number;
  /** Where an unfinished stretch reaches to. Nothing is stored about it
      (ADR-0010), so it is asked of the caller rather than of a clock. */
  today: number;
}

/** How many positions a chart needs before an annotation can be placed on it.

    One position is not a plot: every day maps to the same pixel, so a band is
    a hairline and every mark is the same mark. A chart drawn from a single
    reading takes no annotations - and the caption has to read the same rule,
    or it names things the plot never drew. */
export const MIN_PLOT_POSITIONS = 2;

/** How close two marks may come before they are drawn as one, in pixels.

    Under about five pixels apart the ticks overlap into a single thicker
    tick, which is the worst of both: it reads as one event and is drawn as
    three. Gathered instead, so one mark stands for what is really there and
    the readout names all of it. */
export const MIN_MARK_GAP = 5;

/** Everything in `sources` that falls inside the range, clipped to it and
    ordered by where it sits.

    A stretch is kept when it overlaps the range at all, including one that
    started long before and one that has not finished: those are the cases
    the whole thing is for. A moment is kept only on its own day. */
export function annotationsInRange(
  sources: readonly ChartAnnotationSource[],
  range: AnnotationRange
): ChartAnnotation[] {
  const found: ChartAnnotation[] = [];

  for (const source of sources) {
    const shape = SHAPE[source.kind];
    const start = source.startEpochDay;
    // A moment has no end of its own; a stretch that has not finished runs to
    // today, and never backwards past its own start.
    const end = shape === 'point' ? start : (source.endEpochDay ?? Math.max(range.today, start));
    if (!spanOverlapsRange({ startEpochDay: start, endEpochDay: end }, range.from, range.to)) continue;

    found.push({
      id: source.id,
      kind: source.kind,
      name: source.name,
      shape,
      fromEpochDay: Math.max(start, range.from),
      toEpochDay: Math.min(end, range.to),
      href: source.href,
      series: source.series,
      startsInRange: start >= range.from,
      // A moment ends on the day it happened, and a moment outside the range
      // never got this far. A stretch that has not ended has no day to draw
      // an edge at.
      endsInRange: shape === 'point' || (source.endEpochDay !== null && end <= range.to),
      endReason: source.endReason
    });
  }

  return found.sort((a, b) => a.fromEpochDay - b.fromEpochDay || a.id.localeCompare(b.id));
}

/** The days a set of readings covers, as a range to ask the journal for.

    Two screens draw a chart over however long there have been readings rather
    than over a range somebody picked - the lab series and the voice benchmark
    trend - and both were working the same two reductions out for themselves.
    Today is always in it, so a journal whose readings all predate it still
    gets a range that reaches the present, and a journal with no readings at
    all gets today rather than an infinity. */
export function annotationSpan(days: readonly number[], today: number): { from: number; to: number } {
  return { from: Math.min(...days, today), to: Math.max(...days, today) };
}

/** The same annotations, cut down to a narrower range.

    For a screen that draws several charts over different ranges off one
    query: the lab results screen has a chart per unit and each one covers
    however long that analyte has been drawn for, so one range does not fit
    them all. Asking the journal once and narrowing here beats a query per
    chart, and narrowing has to be its own step rather than a second
    `annotationsInRange` pass because a clipped annotation no longer knows
    which day it really started on - only that the day was outside. So an
    edge that was already lost stays lost. */
export function narrowAnnotations(
  annotations: readonly ChartAnnotation[],
  from: number,
  to: number
): ChartAnnotation[] {
  const out: ChartAnnotation[] = [];
  for (const annotation of annotations) {
    if (annotation.fromEpochDay > to || annotation.toEpochDay < from) continue;
    out.push({
      ...annotation,
      fromEpochDay: Math.max(annotation.fromEpochDay, from),
      toEpochDay: Math.min(annotation.toEpochDay, to),
      startsInRange: annotation.startsInRange && annotation.fromEpochDay >= from,
      endsInRange: annotation.endsInRange && annotation.toEpochDay <= to
    });
  }
  return out;
}

/** The day one stretch inside a band began, and which stretch that was. The
    annotation travels with the position because the edge is a mark somebody
    can point at, and a bare x cannot say what it belongs to. */
export interface AnnotationEdge {
  x: number;
  annotation: ChartAnnotation;
}

/** A stretch, as a rectangle behind the plot. */
export interface AnnotationBand {
  key: string;
  x1: number;
  x2: number;
  /** Every constituent's real start, where that day is inside the range: the
      edge line the band draws is the day something began, and a band clipped
      by the chart's own left edge has none. */
  edges: AnnotationEdge[];
  annotations: ChartAnnotation[];
}

/** A moment, as a tick off the baseline. Several where they land together. */
export interface AnnotationMark {
  key: string;
  x: number;
  annotations: ChartAnnotation[];
}

export interface PlacedAnnotations {
  bands: AnnotationBand[];
  marks: AnnotationMark[];
}

/** Where a day sits across the plot, in pixels.

    A chart draws its positions evenly spaced whatever the days behind them
    are (grain.ts buckets first), so this walks the positions rather than the
    calendar: the bucket a day falls in, plus how far through it the day is.
    Off either end clamps, which is what a clipped band's edge wants. */
function pixelAt(points: readonly { x: number }[], day: number, width: number): number {
  const last = points.length - 1;
  if (last <= 0) return 0;
  const step = width / last;
  if (day <= points[0].x) return 0;
  if (day >= points[last].x) return width;

  let i = 0;
  while (i < last - 1 && points[i + 1].x <= day) i++;
  const span = points[i + 1].x - points[i].x;
  const through = span > 0 ? (day - points[i].x) / span : 0;
  return (i + through) * step;
}

/** The annotations laid out across a plot `width` wide, drawn against the
    positions the chart is already drawing.

    Two things happen here and both are about legibility rather than about
    data. Overlapping bands merge, because two washes laid over each other are
    twice the wash and the chart underneath stops being readable exactly where
    most is happening. Marks closer than `MIN_MARK_GAP` gather into one,
    because three ticks drawn on top of each other are one tick that lies
    about being one. Neither drops anything: a merged band and a gathered mark
    both carry every annotation in them, and the readout names them all. */
export function placeAnnotations(
  annotations: readonly ChartAnnotation[],
  points: readonly { x: number }[],
  width: number
): PlacedAnnotations {
  if (points.length < MIN_PLOT_POSITIONS) return { bands: [], marks: [] };

  const bands: AnnotationBand[] = [];
  const marks: AnnotationMark[] = [];

  for (const annotation of annotations) {
    if (annotation.shape === 'span') {
      const x1 = pixelAt(points, annotation.fromEpochDay, width);
      const x2 = pixelAt(points, annotation.toEpochDay, width);
      const edges = annotation.startsInRange ? [{ x: x1, annotation }] : [];
      const open = bands[bands.length - 1];
      // Sorted by start, so only the band most recently opened can overlap.
      if (open && x1 <= open.x2) {
        open.x2 = Math.max(open.x2, x2);
        open.edges.push(...edges);
        open.annotations.push(annotation);
      } else {
        bands.push({ key: annotation.id, x1, x2, edges, annotations: [annotation] });
      }
      continue;
    }

    const x = pixelAt(points, annotation.fromEpochDay, width);
    const open = marks[marks.length - 1];
    if (open && x - open.x < MIN_MARK_GAP) {
      open.annotations.push(annotation);
      open.x = x;
    } else {
      marks.push({ key: annotation.id, x, annotations: [annotation] });
    }
  }

  // A gathered mark stands where its members' average does rather than where
  // the last one to join it happened to be.
  for (const mark of marks) {
    mark.x = mark.annotations.reduce((total, a) => total + pixelAt(points, a.fromEpochDay, width), 0) / mark.annotations.length;
  }

  return { bands, marks };
}

/** What was happening at one of the chart's positions, for the readout under
    a finger.

    A position stands for its whole bucket, not only for the day it is named
    after: at the week grain, a milestone on the Thursday belongs to the week
    the finger is on. Moments first, then stretches - what happened that day
    before what was going on around it. */
export function annotationsAtPoint(
  annotations: readonly ChartAnnotation[],
  points: readonly { x: number }[],
  index: number
): ChartAnnotation[] {
  const point = points[index];
  if (!point) return [];

  const next = points[index + 1];
  const previous = points[index - 1];
  const width = next ? next.x - point.x : previous ? point.x - previous.x : 1;
  const to = point.x + Math.max(width, 1) - 1;

  const here = annotations.filter((a) => a.fromEpochDay <= to && a.toEpochDay >= point.x);
  return [...here.filter((a) => a.shape === 'point'), ...here.filter((a) => a.shape === 'span')];
}
