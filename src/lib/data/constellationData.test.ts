import { describe, expect, it } from 'vitest';

import {
  TRACE_FLOOR,
  TRACE_HALF_LIFE,
  TRACE_WINDOW,
  plotPoints,
  tracedThrough,
  type ConstellationReading
} from './constellationData';

const SCALE = { min: 0, max: 100 };

const reading = (over: Partial<ConstellationReading> = {}): ConstellationReading => ({
  id: 'e1',
  day: 20100,
  x: 50,
  y: 50,
  presentationId: null,
  ...over
});

describe('placing a reading on the plane', () => {
  it('puts each value where it sits in its own axis, low at 0 and high at 1', () => {
    const [point] = plotPoints([reading({ x: 25, y: 100 })], SCALE, SCALE);
    expect(point.x).toBeCloseTo(0.25);
    expect(point.y).toBe(1);
  });

  /* The two axes are two different scales as often as not - a 0-10 custom
     scale against a 0-100 built-in - and the whole point of the plane is
     that a position on it means the same thing in both directions. */
  it('reads each axis against its own range, not against a shared one', () => {
    const [point] = plotPoints([reading({ x: 5, y: 25 })], { min: 0, max: 10 }, SCALE);
    expect(point.x).toBeCloseTo(0.5);
    expect(point.y).toBeCloseTo(0.25);
  });

  /* A scale's range is editable, so a value logged against the old one can
     sit outside the new one. It belongs at the edge of the plot rather than
     off it: the reading happened. */
  it('holds a value logged outside the axis at the axis end', () => {
    const [point] = plotPoints([reading({ x: -20, y: 300 })], SCALE, SCALE);
    expect(point.x).toBe(0);
    expect(point.y).toBe(1);
  });

  /* ADR-0048: an entry with no presentation is a valid resting state, not a
     gap to filter out. It plots and carries no colour. */
  it('keeps a reading that carries no presentation', () => {
    const [point] = plotPoints([reading({ presentationId: null })], SCALE, SCALE);
    expect(point.presentationId).toBeNull();
  });
});

describe('tracing the path up to a position', () => {
  const readings = Array.from({ length: 40 }, (_, i) =>
    reading({ id: `e${i}`, day: 20100 + i, x: i, y: i })
  );
  const plotted = plotPoints(readings, SCALE, SCALE);

  it('draws nothing after the scrubbed position', () => {
    const traced = tracedThrough(plotted, 9);
    expect(traced).toHaveLength(10);
    expect(traced[traced.length - 1].id).toBe('e9');
  });

  it('draws the whole path at the far end', () => {
    expect(tracedThrough(plotted, plotted.length - 1)).toHaveLength(40);
  });

  /* The bound the density note argues for: a year of daily entries is more
     marks than a 330px square can keep apart, so the plot holds a window
     and the scrubber moves it. Nothing is unreachable - the older stretch
     is one drag back. */
  it('holds a window of readings rather than the whole journal', () => {
    const year = plotPoints(
      Array.from({ length: 365 }, (_, i) => reading({ id: `y${i}`, day: 20000 + i })),
      SCALE,
      SCALE
    );
    const traced = tracedThrough(year, 364);
    expect(traced).toHaveLength(TRACE_WINDOW);
    expect(traced[traced.length - 1].id).toBe('y364');
    expect(traced[0].id).toBe(`y${365 - TRACE_WINDOW}`);
  });

  it('starts the window at the oldest reading in a short journal', () => {
    expect(tracedThrough(plotted, 39)[0].id).toBe('e0');
  });

  /* The head is what the readout names and what the ring sits on, so it is
     the one point drawn at full strength whatever the window behind it. */
  it('draws the scrubbed reading at full strength', () => {
    const traced = tracedThrough(plotted, 20);
    expect(traced[traced.length - 1].weight).toBe(1);
  });

  /* The overlap answer: nothing is moved off its own values, and depth
     comes from how recent a reading is. A half-life rather than a linear
     ramp so the recent stretch reads the same whether the window holds
     thirty readings or three hundred. */
  it('halves a reading\'s strength every half-life of readings back', () => {
    const traced = tracedThrough(plotted, 39);
    const head = traced[39].weight;
    const older = traced[39 - TRACE_HALF_LIFE].weight;
    expect(older - TRACE_FLOOR).toBeCloseTo((head - TRACE_FLOOR) / 2);
  });

  it('never fades a reading away entirely', () => {
    const traced = tracedThrough(plotted, 39);
    expect(traced[0].weight).toBeGreaterThanOrEqual(TRACE_FLOOR);
  });

  it('has nothing to trace through an empty journal', () => {
    expect(tracedThrough([], 0)).toEqual([]);
  });

  /* The scrubber's own bounds move when the range picker does, and a stale
     index arriving one render before the new points is an out-of-range read
     rather than a crash. */
  it('holds a position past the end to the last reading', () => {
    expect(tracedThrough(plotted, 900)).toHaveLength(40);
  });
});

/* Ticket AU-20: the each-block that draws these keys by `slot` now, not by
   `id`, so a sliding window updates TRACE_WINDOW stable DOM nodes instead of
   destroying and recreating most of them every frame. `slot` is a reading's
   absolute index mod TRACE_WINDOW - a ring buffer position - which only
   works because this window is dense and ordered: every index between
   `first` and `head` is a reading, and nothing is ever reordered. */
describe('keying a stable window position', () => {
  const year = plotPoints(
    Array.from({ length: 365 }, (_, i) => reading({ id: `y${i}`, day: 20000 + i })),
    SCALE,
    SCALE
  );

  it('gives every reading in the window its own slot', () => {
    const traced = tracedThrough(year, 200);
    const slots = new Set(traced.map((point) => point.slot));
    expect(slots.size).toBe(traced.length);
  });

  it('matches slot to array position while the window is still filling', () => {
    const traced = tracedThrough(year, 50);
    traced.forEach((point, i) => expect(point.slot).toBe(i));
  });

  it('keeps a reading on the same slot from one frame to the next', () => {
    const before = tracedThrough(year, 200);
    const after = tracedThrough(year, 201);
    const stillThere = before.find((point) => point.id === 'y150');
    const stillThereAfter = after.find((point) => point.id === 'y150');
    expect(stillThereAfter?.slot).toBe(stillThere?.slot);
  });

  it('hands a leaving reading\'s slot to the one that replaces it', () => {
    const before = tracedThrough(year, 200);
    const after = tracedThrough(year, 201);
    const leaving = before[0];
    const entering = after[after.length - 1];
    expect(entering.slot).toBe(leaving.slot);
  });
});
