/* Select dated context for charts without changing their values.
   A moment marks a day and a stretch spans an interval. An open
   regimen episode ends at the supplied today. Keep this logic pure
   and put labels and drawing in the chart kit (ADR-0016).

   Annotate dated values, per-analyte lab series, body-map trajectories
   and voice trends. Keep Safe Space's 30-day chart free of unsolicited
   surgery and recovery context. Interval mood uses positions within
   a dosing interval, so date annotations do not apply.

   Entry days already appear in the plotted series. Appointments,
   including consults, qualify as dated context. The annotations say
   what happened and when. The separate correlation code owns any
   analysis of readings. */

import type { EpisodeEndReason } from '../data/types';
import { spanOverlapsRange } from '../data/span';

/**
 * Use dates the journal already stores. A Procedure supplies the
 * surgery point and recovery span. finishedArea marks the day the
 * person ended the stream. The chart kit resolves its area key to
 * a label so a finished practice is distinct from a reporting gap.
 *
 * Plot each past appointment, including consults, by its own date
 * and optional kind.
 */
export type ChartAnnotationKind =
  | 'milestone'
  | 'surgery'
  | 'regimen'
  | 'recovery'
  | 'dosePause'
  | 'tryout'
  | 'era'
  | 'appointment'
  | 'finishedArea'
  | 'suspendedArea';

/** Whether a kind is a moment or a stretch. Here rather than on each record,
    so no caller can hand in a milestone that claims to be a period.

    `era` is a point rather than a span: the mark is the boundary an era's
    start draws, not the stretch itself - the calendar shades the stretch,
    and a chart would need a wash in every era's colour to do the same,
    which this avoids as a second mechanism. */
const SHAPE: Record<ChartAnnotationKind, 'point' | 'span'> = {
  milestone: 'point',
  surgery: 'point',
  regimen: 'span',
  recovery: 'span',
  dosePause: 'span',
  tryout: 'span',
  era: 'point',
  appointment: 'point',
  finishedArea: 'point',
  /* A point, the same reason `finishedArea` is one: the day the pause
     started is what a flat stretch after it needs explaining with, not a
     stretch of its own - the app has no stored day the pause ended (that
     is what resuming clears, not sets). */
  suspendedArea: 'point'
};

/** What one tick says beyond its own name, carried from the record behind it.

    Raw rather than written out, for the reason `finishedArea`'s `name` is a key: this tier
    imports no paraglide (ADR-0016), and a severity and a site are both words the catalogue
    owns. kit/chartAnnotation.ts turns each of these into the line a reader sees.

    Only text written behind a record reaches this field. */
export type ChartAnnotationDetail =
  /** A milestone's description, a procedure's notes, an appointment's note:
      the person's own words, already known to be non-empty. */
  | { type: 'note'; text: string };

/** One dated thing, as the query hands it over: stored days, untouched.

    `endEpochDay` is null on every point event, and on a stretch that has not
    finished - the same meaning `RegimenEpisode`, `DosePause` and `Tryout`
    all give it in types.ts. */
export interface ChartAnnotationSource {
  id: string;
  kind: ChartAnnotationKind;
  /** What the record calls itself: a milestone's name, an episode's drug, a
      procedure's name, a tryout's label. Null where the record has no name
      of its own, such as a dose pause whose episode is gone. */
  name: string | null;
  startEpochDay: number;
  endEpochDay: number | null;
  /** Why a `regimen` episode ended. Absent on every other kind, and null
      on a `regimen` source that is still open or that ended before this
      field existed. */
  endReason?: EpisodeEndReason | null;
  /** What this tick says beyond its name, when the record has text. */
  detail?: ChartAnnotationDetail;
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
  endReason?: EpisodeEndReason | null;
  /** The source's, carried through unchanged. */
  detail?: ChartAnnotationDetail;
}

interface AnnotationRange {
  from: number;
  to: number;
  /** Where an unfinished stretch reaches to. Nothing is stored about it,
      so it is asked of the caller rather than of a clock. */
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
/* MIN_MARK_GAP stays exported only for its own test (AU-09 test-only review). */
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
      startsInRange: start >= range.from,
      // A moment ends on the day it happened, and a moment outside the range
      // never got this far. A stretch that has not ended has no day to draw
      // an edge at.
      endsInRange: shape === 'point' || (source.endEpochDay !== null && end <= range.to),
      endReason: source.endReason,
      detail: source.detail
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
interface AnnotationBand {
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

/** How many days the position at `index` stands for.

    A chart's positions are its buckets (grain.ts), so the day a position is
    named after is only the first of however many it covers - a week at the
    week grain, a month at the month grain, and however far it is to the
    next reading where a gap dropped the buckets in between.

    Two readers, which is why it is a function rather than four lines
    written twice: the readout under a finger collects everything inside the
    bucket, and it dates each tick's own line exactly when the position it
    sits at cannot say which day was meant. */
export function positionDays(points: readonly { x: number }[], index: number): number {
  const point = points[index];
  if (!point) return 1;
  const next = points[index + 1];
  const previous = points[index - 1];
  return Math.max(next ? next.x - point.x : previous ? point.x - previous.x : 1, 1);
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

  const to = point.x + positionDays(points, index) - 1;

  const here = annotations.filter((a) => a.fromEpochDay <= to && a.toEpochDay >= point.x);
  return [...here.filter((a) => a.shape === 'point'), ...here.filter((a) => a.shape === 'span')];
}
