/* Map the chosen scales to the two axes through metricRange.normalize
   (ADR-0048). Keep native units for displayed values (ADR-0012).
   The screen resolves presentation IDs to palette roles.

   Keep each point at its actual readings. Stacked alpha makes repeated
   positions darker. Strength halves every TRACE_HALF_LIFE readings
   behind the scrubber down to a floor, so equally recent stretches read
   the same in sparse and dense journals. TRACE_WINDOW bounds the marks
   per frame. Scrub backward to see older readings. */

import { normalize, type MetricRange } from './metricRange';

export interface ConstellationReading {
  /** The entry's travelling uuid (ADR-0002), which is also the point's key. */
  id: string;
  day: number;
  /** The x scale's value in its own native units, straight off the entry. */
  x: number;
  y: number;
  /** Null where the entry carries no presentation, which is a resting state
      rather than a gap (ADR-0048). The point still plots; it just has no
      role to take a colour from. */
  presentationId: string | null;
}

export interface PlottedPoint extends Omit<ConstellationReading, 'x' | 'y'> {
  /** 0 at the x scale's low end, 1 at its high end. */
  x: number;
  /** 0 at the y scale's low end, 1 at its high end. Nothing is flipped for
      SVG here: which way up a plot is drawn belongs to the thing drawing
      it. */
  y: number;
}

export interface ConstellationPoint extends PlottedPoint {
  /** How strongly this reading is drawn, 0 to 1. See the overlap note
      above. */
  weight: number;
  /** This reading's place in a ring buffer TRACE_WINDOW long: its absolute
      index into the full reading list, mod TRACE_WINDOW (ticket AU-20). The
      window is dense and ordered - every index is a reading, nothing is ever
      reordered - so as the scrubber steps forward one reading at a time, a
      slot's old occupant leaves exactly when the entering reading is
      TRACE_WINDOW indices later, which lands it back on the same slot. Keyed
      on this instead of on `id`, the each-block reuses one DOM node per slot
      across a frame rather than destroying and recreating most of the
      window. This would be wrong on a sparse or reorderable list, where nothing
      guarantees the same slot's neighbour across frames is the same reading. */
  slot: number;
}

/** How many readings back a reading's strength halves. Twelve is about a
    fortnight of daily journalling, which is the stretch a path has to hold
    for a trajectory to be readable at all. */
/* TRACE_HALF_LIFE stays exported only for its own test (AU-09 test-only
   review). */
export const TRACE_HALF_LIFE = 12;

/** How many readings are on the plot at once. About four months of daily
    journalling, which is long enough for a season to be visible in it and
    short enough that the oldest marks are still separate marks. */
/* TRACE_WINDOW stays exported only for its own test (AU-09 test-only review). */
export const TRACE_WINDOW = 120;

/** The strength an old reading never drops below. Low enough that a year of
    them reads as ground rather than as data, high enough that a single old
    reading on its own is still visible - it happened, and a chart that hides
    it is a chart with a memory.

    Set from the light theme rather than the dark one. At 0.12 the ramp read
    well on the dark theme and the oldest marks were gone on the light one:
    the flags' pale stripes - trans's pink and blue, agender's grey - are
    within a few percent of a white card before any alpha is applied to them,
    so the floor has to clear a ground the dark theme never tested. */
/* TRACE_FLOOR stays exported only for its own test (AU-09 test-only review). */
export const TRACE_FLOOR = 0.25;

/** Each reading's position on the plane, both values held inside their own
    scale's ends.

    Held, because a scale's range is editable and a value logged against the
    old one can fall outside the new one. The reading happened, so it belongs
    at the edge of the plot rather than off it - which is `normalize`'s own
    clamp, taken rather than rewritten. */
export function plotPoints(
  readings: ConstellationReading[],
  x: MetricRange,
  y: MetricRange
): PlottedPoint[] {
  return readings.map((reading) => ({
    id: reading.id,
    day: reading.day,
    presentationId: reading.presentationId,
    x: normalize(reading.x, x),
    y: normalize(reading.y, y)
  }));
}

/** The path up to and including the scrubbed reading, each point carrying
    the strength it is drawn at and the window slot it draws in (ADR-0058 /
    ticket AU-20).

    An index rather than a day, because order is the only thing time is on
    this chart: neither axis is a date, so a gap in journalling has nowhere
    to be drawn and scrubbing by calendar day would spend most of the track
    on stretches with nothing in them. */
export function tracedThrough(points: PlottedPoint[], index: number): ConstellationPoint[] {
  if (points.length === 0) return [];
  const head = Math.min(Math.max(index, 0), points.length - 1);
  const first = Math.max(0, head - TRACE_WINDOW + 1);
  return points.slice(first, head + 1).map((point, i) => ({
    ...point,
    weight: TRACE_FLOOR + (1 - TRACE_FLOOR) * 0.5 ** ((head - first - i) / TRACE_HALF_LIFE),
    slot: (first + i) % TRACE_WINDOW
  }));
}

/** A day label's measured box around its own baseline, in real pixels:
    its advance across, and how far the font reaches above and below the
    baseline. */
export interface LabelBox {
  width: number;
  ascent: number;
  descent: number;
}

/** Where a label is written: the baseline point and which end of the text
    sits on it, which is what an SVG `<text>` takes. */
export interface PlacedLabel {
  x: number;
  y: number;
  anchor: 'start' | 'end';
}

/** Ink already painted on the plane, in real pixels: the segment from
    (x1, y1) to (x2, y2) widened by `reach` on every side. A dot is one
    whose two ends are its centre, with its radius and the outer half of
    its stroke as the reach; a trail join is its two ends and half its
    width. */
export interface Ink {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  reach: number;
}

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** How far a label's box sits from its own dot's centre: 6px across, 2px
    up or down. A 3px dot with its 1px edge reaches 4px, so a box at that
    corner clears it by 2.3px. */
const LABEL_ACROSS = 6;
const LABEL_UP = 2;
/** The least room between a label and any ink, any box laid over the
    plot, or another label. */
const LABEL_CLEARANCE = 2;

/** How far a point is from a rectangle, 0 inside it. */
function pointToRect(x: number, y: number, r: Rect): number {
  return Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
}

/** How far a point is from a segment. */
function pointToSegment(x: number, y: number, { x1, y1, x2, y2 }: Ink): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.min(1, Math.max(0, ((x - x1) * dx + (y - y1) * dy) / length));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

/** How far a segment is from a rectangle, 0 where it touches or crosses
    it. Apart, the nearest two points are an end of the segment and the box,
    or a corner of the box and the segment. Crossing is the segment's line
    having corners on both sides of it within the segment's own extent. */
function segmentToRect(ink: Ink, r: Rect): number {
  const { x1, y1, x2, y2 } = ink;
  const corners: [number, number][] = [
    [r.left, r.top],
    [r.right, r.top],
    [r.right, r.bottom],
    [r.left, r.bottom]
  ];
  const sides = corners.map(([cx, cy]) => Math.sign((x2 - x1) * (cy - y1) - (y2 - y1) * (cx - x1)));
  const crosses =
    sides.some((side) => side >= 0) &&
    sides.some((side) => side <= 0) &&
    Math.min(x1, x2) <= r.right &&
    Math.max(x1, x2) >= r.left &&
    Math.min(y1, y2) <= r.bottom &&
    Math.max(y1, y2) >= r.top;
  if (crosses) return 0;
  return Math.min(
    pointToRect(x1, y1, r),
    pointToRect(x2, y2, r),
    ...corners.map(([cx, cy]) => pointToSegment(cx, cy, ink))
  );
}

const overlaps = (a: Rect, b: Rect, gap: number) =>
  a.left < b.right + gap && b.left < a.right + gap && a.top < b.bottom + gap && b.top < a.bottom + gap;

/**
 * Place labels in descending weight, matching draw recency. For each dot at least `minGap` from another labeled dot, try upper right, upper left, lower right, then lower left. Use the first box inside the inset plot that clears `ink`, `keepOut`, and placed labels by `LABEL_CLEARANCE`. Omit labels that cannot fit. Point positions stay fixed.
 */
export function placeLabels(
  points: readonly ConstellationPoint[],
  plane: {
    plot: number;
    pad: number;
    minGap: number;
    ink: readonly Ink[];
    keepOut: readonly Rect[];
    measure: (point: ConstellationPoint) => LabelBox;
  }
): Map<number, PlacedLabel> {
  const { plot, pad, minGap, ink, keepOut, measure } = plane;
  const edge = plot + pad * 2;
  const byWeight = points.map((_, index) => index).sort((a, b) => points[b].weight - points[a].weight);
  const dots: { x: number; y: number }[] = [];
  const boxes: Rect[] = [];
  const placed = new Map<number, PlacedLabel>();
  for (const index of byWeight) {
    const point = points[index];
    const x = pad + point.x * plot;
    const y = pad + (1 - point.y) * plot;
    if (dots.some((d) => Math.hypot(d.x - x, d.y - y) < minGap)) continue;
    const { width, ascent, descent } = measure(point);
    for (const [right, up] of [
      [true, true],
      [false, true],
      [true, false],
      [false, false]
    ]) {
      const left = right ? x + LABEL_ACROSS : x - LABEL_ACROSS - width;
      const top = up ? y - LABEL_UP - ascent - descent : y + LABEL_UP;
      const box = { left, top, right: left + width, bottom: top + ascent + descent };
      if (box.left < 0 || box.top < 0 || box.right > edge || box.bottom > edge) continue;
      if (ink.some((mark) => segmentToRect(mark, box) < mark.reach + LABEL_CLEARANCE)) continue;
      if (keepOut.some((r) => overlaps(r, box, LABEL_CLEARANCE))) continue;
      if (boxes.some((r) => overlaps(r, box, LABEL_CLEARANCE))) continue;
      dots.push({ x, y });
      boxes.push(box);
      placed.set(point.slot, {
        x: right ? box.left : box.right,
        y: box.top + ascent,
        anchor: right ? 'start' : 'end'
      });
      break;
    }
  }
  return placed;
}

/** A pair of scales and how many entries carry both (stats.constellationPairs). */
export interface ScalePair {
  a: string;
  b: string;
  count: number;
}

/** The scales the plane can put on an axis: with `x` null, every ticked
    scale that some other ticked scale has points with; with `x` given, the
    ticked scales that do with `x`. In `active` order, so the pickers keep
    the order Settings gives the scales. Bug session 18, item 41: a picker
    that offers a pair with no points makes people hunt for one that draws. */
export function planePartners(pairs: readonly ScalePair[], active: readonly string[], x: string | null): string[] {
  const has = new Set<string>();
  for (const { a, b, count } of pairs) {
    if (count < 1 || !active.includes(a) || !active.includes(b)) continue;
    if (x === null) {
      has.add(a);
      has.add(b);
    } else if (a === x) has.add(b);
    else if (b === x) has.add(a);
  }
  return active.filter((key) => has.has(key));
}

/** The axes to draw: the picked pair while it has points; otherwise the
    picked x with its first partner; otherwise the pair with the most
    points, in `active` order. Null when no two ticked scales share an entry. */
export function planeAxes(
  pairs: readonly ScalePair[],
  active: readonly string[],
  picked: { x: string; y: string }
): { x: string; y: string } | null {
  const partnersOfX = planePartners(pairs, active, picked.x);
  if (partnersOfX.includes(picked.y)) return picked;
  if (partnersOfX.length) return { x: picked.x, y: partnersOfX[0] };
  let best: ScalePair | null = null;
  for (const pair of pairs) {
    if (!active.includes(pair.a) || !active.includes(pair.b) || pair.count < 1) continue;
    if (!best || pair.count > best.count) best = pair;
  }
  if (!best) return null;
  const [x, y] = active.indexOf(best.a) <= active.indexOf(best.b) ? [best.a, best.b] : [best.b, best.a];
  return { x, y };
}
