import { describe, expect, it } from 'vitest';

import {
  TRACE_FLOOR,
  TRACE_HALF_LIFE,
  TRACE_WINDOW,
  placeLabels,
  planeAxes,
  planePartners,
  plotPoints,
  tracedThrough,
  type ConstellationPoint,
  type ConstellationReading,
  type Ink
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

/* The each-block that draws these keys by `slot` now, not by `id`, so a sliding window
   updates TRACE_WINDOW stable DOM nodes instead of destroying and recreating most of them
   every frame. `slot` is a reading's absolute index mod TRACE_WINDOW - a ring buffer
   position - which only works because this window is dense and ordered: every index between
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


/* Ticket put a day beside the points that had room for one, and last- made "room" mean room
   among the marks as well as among the other labels: on the demo journal "21 Sept" and "11
   Oct" were struck through by dots and trail joins. Every case below is worked by hand on a
   284px plot inset by 8px, so the plane is 300px square, with every label 40px wide, 12px
   above its baseline and 4px below it. */
describe('placing the day labels among the marks', () => {
  const PLOT = 284;
  const PAD = 8;
  const BOX = { width: 40, ascent: 12, descent: 4 };
  const point = (over: Partial<ConstellationPoint> = {}): ConstellationPoint => ({
    id: 'e1',
    day: 20100,
    x: 0.5,
    y: 0.5,
    presentationId: null,
    weight: 1,
    slot: 0,
    ...over
  });
  /** Each point's own dot, as the chart paints it: 3px with a 1px edge. */
  const dots = (points: ConstellationPoint[]): Ink[] =>
    points.map((p) => {
      const x = PAD + p.x * PLOT;
      const y = PAD + (1 - p.y) * PLOT;
      return { x1: x, y1: y, x2: x, y2: y, reach: 4 };
    });
  const place = (points: ConstellationPoint[], extra: { ink?: Ink[]; keepOut?: { left: number; top: number; right: number; bottom: number }[]; minGap?: number } = {}) =>
    placeLabels(points, {
      plot: PLOT,
      pad: PAD,
      minGap: extra.minGap ?? 20,
      ink: [...dots(points), ...(extra.ink ?? [])],
      keepOut: extra.keepOut ?? [],
      measure: () => BOX
    });
  const rounded = (placed: Map<number, { x: number; y: number; anchor: string }>) =>
    new Map([...placed].map(([slot, at]) => [slot, { x: Math.round(at.x * 100) / 100, y: Math.round(at.y * 100) / 100, anchor: at.anchor }]));

  it('has nothing to label in an empty journal', () => {
    expect(place([])).toEqual(new Map());
  });

  /* The dot is at 150,150. Up and to the right, the box's near corner sits
     6px across and 2px up from the centre, which clears the dot's 4px by
     2.3px: the box spans 156-196 across and 132-148 down, so the baseline
     is 4px above its bottom, at 144. */
  it('writes a lone day up and to the right of its dot', () => {
    expect(rounded(place([point()]))).toEqual(new Map([[0, { x: 156, y: 144, anchor: 'start' }]]));
  });

  it('moves a day to the left when another dot sits where it would go', () => {
    const ink = [{ x1: 176, y1: 140, x2: 176, y2: 140, reach: 4 }];
    expect(rounded(place([point()], { ink }))).toEqual(new Map([[0, { x: 144, y: 144, anchor: 'end' }]]));
  });

  /* A join running level at 140 crosses both boxes above the dot, so the
     day goes below: its box spans 152-168, baseline at 164. */
  it('moves a day below its dot when a trail join runs through both places above it', () => {
    const ink = [{ x1: 100, y1: 140, x2: 200, y2: 140, reach: 0.5 }];
    expect(rounded(place([point()], { ink }))).toEqual(new Map([[0, { x: 156, y: 164, anchor: 'start' }]]));
  });

  /* A join running down x=176 from 100 to 180 cuts through both boxes on
     the right with its ends 32px outside them and every corner 20px away,
     so only the crossing itself says it is there. */
  it('catches a join that crosses a box with neither end inside it', () => {
    const ink = [{ x1: 176, y1: 100, x2: 176, y2: 180, reach: 0.5 }];
    expect(rounded(place([point()], { ink }))).toEqual(new Map([[0, { x: 144, y: 144, anchor: 'end' }]]));
  });

  it('drops a day rather than write it over a mark when no place around its dot is clear', () => {
    const ink = [
      { x1: 100, y1: 140, x2: 200, y2: 140, reach: 0.5 },
      { x1: 100, y1: 160, x2: 200, y2: 160, reach: 0.5 }
    ];
    expect(place([point()], { ink })).toEqual(new Map());
  });

  it('keeps a day inside the plane at its right and top edges', () => {
    // At x=1 the dot is at 292: a box to the right would end at 338.
    expect(rounded(place([point({ x: 1 })]))).toEqual(new Map([[0, { x: 286, y: 144, anchor: 'end' }]]));
    // At y=1 the dot is at 8: a box above would start at -10.
    expect(rounded(place([point({ y: 1 })]))).toEqual(new Map([[0, { x: 156, y: 22, anchor: 'start' }]]));
  });

  /* The readout box in the plot's corner is painted over the plot, so a
     day under it is a day nobody can read. */
  it('keeps a day out from under a box laid over the plot', () => {
    const keepOut = [{ left: 150, top: 0, right: 300, bottom: 149 }];
    expect(rounded(place([point()], { keepOut }))).toEqual(new Map([[0, { x: 144, y: 144, anchor: 'end' }]]));
  });

  /* Two readings at nearly the same spot: the newer, fuller-weight one -
     the one the dots themselves already draw stronger - keeps its label,
     and nothing shifts a point to make room for the other's. */
  it('drops the fainter label when two dots sit within the gap', () => {
    const points = [point({ slot: 0, weight: 0.4 }), point({ slot: 1, x: 0.501, weight: 0.9 })];
    expect([...place(points).keys()]).toEqual([1]);
  });

  /* The dots at 150,150 and 150,162 are 12px apart, past a gap of 0. The
     newer day takes its place above and to the right (132-148 down); the
     older one's place to the right would be 144-160, over it, so it goes
     to the left, where the newer dot is exactly 2px from its box. */
  it('moves a day aside for a day already written', () => {
    const points = [point({ slot: 0 }), point({ slot: 1, y: 130 / 284, weight: 0.5 })];
    expect(rounded(place(points, { minGap: 0 }))).toEqual(
      new Map([
        [0, { x: 156, y: 144, anchor: 'start' }],
        [1, { x: 144, y: 156, anchor: 'end' }]
      ])
    );
  });

  it('measures each day for itself', () => {
    const wide = placeLabels([point({ x: 0.8 })], {
      plot: PLOT,
      pad: PAD,
      minGap: 20,
      ink: [],
      keepOut: [],
      measure: () => ({ ...BOX, width: 80 })
    });
    // The dot is at 235.2: 80px to the right would end at 321.2, past 300.
    expect(rounded(wide)).toEqual(new Map([[0, { x: 229.2, y: 144, anchor: 'end' }]]));
  });
});

describe('planeAxes', () => {
  const pairs = [
    { a: 'fem', b: 'masc', count: 2 },
    { a: 'dys', b: 'fem', count: 9 }
  ];
  const active = ['dys', 'fem', 'masc', 'voice'];

  it('keeps a pair that has points, in the order it was picked', () => {
    expect(planeAxes(pairs, active, { x: 'masc', y: 'fem' })).toEqual({ x: 'masc', y: 'fem' });
  });

  it('moves off a pair with no points to the pair with the most', () => {
    expect(planeAxes(pairs, active, { x: 'voice', y: 'fem' })).toEqual({ x: 'dys', y: 'fem' });
    expect(planeAxes(pairs, active, { x: '', y: '' })).toEqual({ x: 'dys', y: 'fem' });
  });

  it('keeps the picked x and finds it a partner when only y is unplottable', () => {
    expect(planeAxes(pairs, active, { x: 'masc', y: 'dys' })).toEqual({ x: 'masc', y: 'fem' });
  });

  it('ignores pairs on scales that are not ticked, and answers null when nothing pairs', () => {
    expect(planeAxes(pairs, ['fem', 'masc'], { x: '', y: '' })).toEqual({ x: 'fem', y: 'masc' });
    expect(planeAxes(pairs, ['fem', 'voice'], { x: 'fem', y: 'voice' })).toBeNull();
  });

  it('offers as x every scale with a partner, and as y the partners of x', () => {
    expect(planePartners(pairs, active, null)).toEqual(['dys', 'fem', 'masc']);
    expect(planePartners(pairs, active, 'fem')).toEqual(['dys', 'masc']);
  });
});
