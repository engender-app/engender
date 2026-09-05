/* The constellation chart's geometry (phase 5 deepening ticket 19,
   ADR-0048): where a reading sits on a plane of two scales, and how much of
   the path behind the scrubber is drawn.

   Two things this deliberately does not decide. It does not choose the two
   scales - they are the person's, picked on the screen, and no dimension key
   appears anywhere in this file or in the component that draws it. And it
   does not know what a presentation looks like: a reading carries the id and
   the screen resolves it through `roleAt()`, so a palette switch recolours
   the whole chart and nothing here has to know a colour exists.

   Both axes are read to 0..1 through `normalize` (metricRange.ts), the same
   function that turns a value into a colour, and for the same reason: the
   two scales are usually not the same scale - a 0-10 custom one against a
   0-100 built-in - and a plane whose two directions mean different amounts
   is not a plane. Native units are the rule for anything shown as a number
   (ADR-0012); a position is not a number shown, which is the line that
   module's own note draws.

   ## The overlap answer

   A year of daily entries is 365 readings inside a square about 330px
   across, which is the honest risk the ticket names. Four things were
   available - jitter, opacity, binning and recency weighting - and the
   choice here is the last two words of that list and none of the first two.

   No jitter. A point's position is its two readings, and moving it so the
   picture reads better is the chart lying about the values it exists to
   show. No binning either: a bin is an average, and the average of two
   opposite days is a day nobody had.

   What is left is depth, and a bound on how much is drawn at once. Each
   reading is drawn at a strength that halves every TRACE_HALF_LIFE readings
   back from the scrubber, down to a floor it never goes below, so the recent
   stretch reads as a path and everything older sits behind it as a cloud.
   Coincident readings stack their alpha, so a spot returned to many times
   comes out darker, which is density as information rather than as a smear.
   The half-life counts readings rather than days, so the recent stretch
   looks the same whether the journal holds thirty of them or three hundred.

   And the plot holds TRACE_WINDOW readings, not all of them. A year of
   daily entries at once is 365 marks inside a square 330px across: about
   270 square pixels each, which is a smear whatever is done to the alpha.
   The window is what the scrubber moves, so nothing is unreachable - drag
   back and the older stretch is on the plot - and the picture at any one
   position is a stretch of path rather than a whole journal poured onto one
   square. */

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
export const TRACE_HALF_LIFE = 12;

/** How many readings are on the plot at once. About four months of daily
    journalling, which is long enough for a season to be visible in it and
    short enough that the oldest marks are still separate marks. */
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
