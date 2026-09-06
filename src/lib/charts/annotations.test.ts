import { describe, expect, it } from 'vitest';

import {
  MIN_MARK_GAP,
  annotationSpan,
  annotationsAtPoint,
  annotationsInRange,
  narrowAnnotations,
  placeAnnotations,
  type ChartAnnotationSource
} from './annotations';

const milestone = (id: string, at: number): ChartAnnotationSource => ({
  id,
  kind: 'milestone',
  name: id,
  startEpochDay: at,
  endEpochDay: null
});

const regimen = (id: string, from: number, to: number | null): ChartAnnotationSource => ({
  id,
  kind: 'regimen',
  name: id,
  startEpochDay: from,
  endEpochDay: to
});

/** Evenly spaced positions, the shape a bucketed chart hands the layer. */
const daily = (from: number, count: number) => Array.from({ length: count }, (_, i) => ({ x: from + i }));

describe('what happened in a range', () => {
  it('keeps a point event inside the range and drops one outside it', () => {
    const found = annotationsInRange([milestone('in', 50), milestone('before', 10), milestone('after', 99)], {
      from: 40,
      to: 60,
      today: 60
    });

    expect(found.map((a) => a.id)).toEqual(['in']);
  });

  it('keeps a point event on either end of the range', () => {
    const found = annotationsInRange([milestone('first', 40), milestone('last', 60)], { from: 40, to: 60, today: 60 });

    expect(found.map((a) => a.id)).toEqual(['first', 'last']);
  });

  /* A regimen that started months before the chart's window and ended
     inside it. The band has to be drawn from the left edge, and its left
     edge must not claim to be the day it started. */
  it('clips a span that starts before the range and ends inside it', () => {
    const [found] = annotationsInRange([regimen('estradiol', 10, 50)], { from: 40, to: 60, today: 60 });

    expect(found.fromEpochDay).toBe(40);
    expect(found.toEpochDay).toBe(50);
    expect(found.startsInRange).toBe(false);
    expect(found.endsInRange).toBe(true);
  });

  it('clips a span that starts inside the range and runs past its end', () => {
    const [found] = annotationsInRange([regimen('estradiol', 45, 900)], { from: 40, to: 60, today: 60 });

    expect(found.fromEpochDay).toBe(45);
    expect(found.toEpochDay).toBe(60);
    expect(found.startsInRange).toBe(true);
    expect(found.endsInRange).toBe(false);
  });

  /* The source's end reason travels through unchanged, on both an edge
     the range actually shows and one it only clips to. Whether the
     reason is safe to *say* against this particular edge is the wording
     layer's gate (kit/chartAnnotation.ts), not this function's. */
  it("carries a regimen episode's end reason through, clipped or not", () => {
    const [clipped] = annotationsInRange([{ ...regimen('estradiol', 10, 50), endReason: 'pausedForNow' }], {
      from: 40,
      to: 45,
      today: 60
    });
    expect(clipped.endsInRange).toBe(false);
    expect(clipped.endReason).toBe('pausedForNow');

    const [shown] = annotationsInRange([{ ...regimen('estradiol', 10, 50), endReason: 'pausedForNow' }], {
      from: 40,
      to: 60,
      today: 60
    });
    expect(shown.endsInRange).toBe(true);
    expect(shown.endReason).toBe('pausedForNow');
  });

  it('spans a range that is entirely inside a longer episode', () => {
    const [found] = annotationsInRange([regimen('estradiol', 10, 900)], { from: 40, to: 60, today: 60 });

    expect(found.fromEpochDay).toBe(40);
    expect(found.toEpochDay).toBe(60);
    expect(found.startsInRange).toBe(false);
    expect(found.endsInRange).toBe(false);
  });

  /* Nothing is stored about an episode still running, so where it reaches
     to is today's question, asked of the argument rather than of a
     clock. */
  it('runs an unfinished span up to today and no further', () => {
    const [found] = annotationsInRange([regimen('estradiol', 45, null)], { from: 40, to: 90, today: 55 });

    expect(found.toEpochDay).toBe(55);
    expect(found.endsInRange).toBe(false);
  });

  it('drops a span that ended before the range began', () => {
    expect(annotationsInRange([regimen('old', 5, 20)], { from: 40, to: 60, today: 60 })).toEqual([]);
  });

  it('drops a span that starts after the range ends', () => {
    expect(annotationsInRange([regimen('later', 80, null)], { from: 40, to: 60, today: 90 })).toEqual([]);
  });

  it('keeps a one-day span, which is a stretch that happened to be short', () => {
    const [found] = annotationsInRange([regimen('one day', 50, 50)], { from: 40, to: 60, today: 60 });

    expect(found.shape).toBe('span');
    expect(found.fromEpochDay).toBe(50);
    expect(found.toEpochDay).toBe(50);
  });

  it('orders what it found by where it sits', () => {
    const found = annotationsInRange([milestone('third', 58), regimen('first', 41, 45), milestone('second', 50)], {
      from: 40,
      to: 60,
      today: 60
    });

    expect(found.map((a) => a.id)).toEqual(['first', 'second', 'third']);
  });
});

describe('where the marks go', () => {
  it('places a point at its own position across the plot', () => {
    const placed = placeAnnotations(
      annotationsInRange([milestone('half', 50)], { from: 40, to: 60, today: 60 }),
      daily(40, 21),
      200
    );

    expect(placed.marks).toHaveLength(1);
    expect(placed.marks[0].x).toBeCloseTo(100, 5);
  });

  it('draws a band from where the span starts to where it stops', () => {
    const placed = placeAnnotations(
      annotationsInRange([regimen('estradiol', 45, 50)], { from: 40, to: 60, today: 60 }),
      daily(40, 21),
      200
    );

    expect(placed.bands).toHaveLength(1);
    expect(placed.bands[0].x1).toBeCloseTo(50, 5);
    expect(placed.bands[0].x2).toBeCloseTo(100, 5);
    expect(placed.bands[0].edges.map((e) => e.x)).toEqual([50]);
    expect(placed.bands[0].edges[0].annotation.id).toBe('estradiol');
  });

  it('leaves a clipped band no start edge to be mistaken for one', () => {
    const placed = placeAnnotations(
      annotationsInRange([regimen('estradiol', 10, 50)], { from: 40, to: 60, today: 60 }),
      daily(40, 21),
      200
    );

    expect(placed.bands[0].x1).toBe(0);
    expect(placed.bands[0].edges).toEqual([]);
  });

  /* Two washes laid over each other are twice the wash, and the chart under
     them stops being readable at exactly the place most is happening. One
     rectangle, both names. */
  it('merges overlapping bands so the wash never doubles', () => {
    const placed = placeAnnotations(
      annotationsInRange([regimen('estradiol', 42, 50), regimen('spiro', 46, 54)], { from: 40, to: 60, today: 60 }),
      daily(40, 21),
      200
    );

    expect(placed.bands).toHaveLength(1);
    expect(placed.bands[0].x1).toBeCloseTo(20, 5);
    expect(placed.bands[0].x2).toBeCloseTo(140, 5);
    expect(placed.bands[0].annotations.map((a) => a.id)).toEqual(['estradiol', 'spiro']);
    expect(placed.bands[0].edges.map((e) => e.x)).toEqual([20, 60]);
    expect(placed.bands[0].edges.map((e) => e.annotation.id)).toEqual(['estradiol', 'spiro']);
  });

  it('leaves bands that do not touch as separate bands', () => {
    const placed = placeAnnotations(
      annotationsInRange([regimen('estradiol', 42, 44), regimen('spiro', 54, 56)], { from: 40, to: 60, today: 60 }),
      daily(40, 21),
      200
    );

    expect(placed.bands).toHaveLength(2);
  });

  /* The legibility floor. Three days apart on a card 300px wide is three
     marks; the same three inside one weekly bucket is one mark, because
     three ticks drawn 0px apart is one tick that lies about being one. */
  it('keeps three annotations on adjacent days apart where there is room', () => {
    const placed = placeAnnotations(
      annotationsInRange([milestone('a', 50), milestone('b', 51), milestone('c', 52)], {
        from: 40,
        to: 60,
        today: 60
      }),
      daily(40, 21),
      300
    );

    expect(placed.marks).toHaveLength(3);
    const gaps = placed.marks.slice(1).map((mark, i) => mark.x - placed.marks[i].x);
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(MIN_MARK_GAP);
  });

  it('gathers three annotations into one mark where there is not', () => {
    const placed = placeAnnotations(
      annotationsInRange([milestone('a', 50), milestone('b', 51), milestone('c', 52)], {
        from: 40,
        to: 60,
        today: 60
      }),
      daily(40, 21),
      40
    );

    expect(placed.marks).toHaveLength(1);
    expect(placed.marks[0].annotations.map((a) => a.id)).toEqual(['a', 'b', 'c']);
  });

  it('places nothing when the chart has no positions to place against', () => {
    const placed = placeAnnotations(annotationsInRange([milestone('a', 50)], { from: 40, to: 60, today: 60 }), [], 300);

    expect(placed.marks).toEqual([]);
    expect(placed.bands).toEqual([]);
  });

  /* A week's bucket is one position, so a day inside it lands on the position
     that holds it rather than a seventh of the way to the next one. */
  it('reads a coarser grain against the bucket a day falls in', () => {
    const weekly = [{ x: 40 }, { x: 47 }, { x: 54 }];
    const placed = placeAnnotations(
      annotationsInRange([milestone('midweek', 50)], { from: 40, to: 60, today: 60 }),
      weekly,
      200
    );

    expect(placed.marks[0].x).toBeGreaterThan(100);
    expect(placed.marks[0].x).toBeLessThan(150);
  });
});

describe('what sits under the finger', () => {
  const points = daily(40, 21);
  const found = annotationsInRange([milestone('a', 50), regimen('estradiol', 45, 55)], {
    from: 40,
    to: 60,
    today: 60
  });

  it('names the point event on its own day and nothing on the next', () => {
    expect(annotationsAtPoint(found, points, 10).map((a) => a.id)).toEqual(['a', 'estradiol']);
    expect(annotationsAtPoint(found, points, 11).map((a) => a.id)).toEqual(['estradiol']);
  });

  it('says nothing where nothing was happening', () => {
    expect(annotationsAtPoint(found, points, 0)).toEqual([]);
  });

  /* At the week grain a position stands for seven days, so what it holds is
     everything in those seven and not only what fell on the Monday. */
  it('covers the whole bucket at a coarser grain', () => {
    const weekly = [{ x: 40 }, { x: 47 }, { x: 54 }];
    expect(annotationsAtPoint(found, weekly, 1).map((a) => a.id)).toEqual(['a', 'estradiol']);
  });

  it('covers the last bucket to the end of its own width', () => {
    const weekly = [{ x: 40 }, { x: 47 }, { x: 54 }];
    const late = annotationsInRange([milestone('late', 59)], { from: 40, to: 60, today: 60 });
    expect(annotationsAtPoint(late, weekly, 2).map((a) => a.id)).toEqual(['late']);
  });
});

describe('cutting one query down to a narrower chart', () => {
  const wide = annotationsInRange([regimen('estradiol', 10, 80), milestone('shot', 50)], {
    from: 20,
    to: 90,
    today: 90
  });

  it('clips a span to the narrower range', () => {
    const [span] = narrowAnnotations(wide, 40, 60);

    expect(span.fromEpochDay).toBe(40);
    expect(span.toEpochDay).toBe(60);
  });

  it('drops what the narrower range does not reach', () => {
    expect(narrowAnnotations(wide, 70, 90).map((a) => a.id)).toEqual(['estradiol']);
  });

  /* A start that the wide range already cut off is gone: the annotation no
     longer carries the day it really began, only that the day was outside. */
  it('never gives back an edge the wider range had already lost', () => {
    const cut = annotationsInRange([regimen('estradiol', 10, 80)], { from: 20, to: 90, today: 90 });
    expect(cut[0].startsInRange).toBe(false);
    expect(narrowAnnotations(cut, 20, 90)[0].startsInRange).toBe(false);
  });

  it('keeps an edge that is still inside the narrower range', () => {
    const inside = annotationsInRange([regimen('estradiol', 30, 80)], { from: 20, to: 90, today: 90 });
    expect(narrowAnnotations(inside, 25, 60)[0].startsInRange).toBe(true);
    expect(narrowAnnotations(inside, 35, 60)[0].startsInRange).toBe(false);
  });
});

describe('the range a set of readings asks for', () => {
  it('reaches from the oldest reading to today', () => {
    expect(annotationSpan([90, 40, 70], 100)).toEqual({ from: 40, to: 100 });
  });

  /* A journal whose last lab was two years ago still gets a range that
     reaches the present, so an episode running through the gap is drawn. */
  it('keeps today in the range even when every reading predates it', () => {
    expect(annotationSpan([40, 50], 900)).toEqual({ from: 40, to: 900 });
  });

  it('covers a reading that somehow sits after today', () => {
    expect(annotationSpan([40, 950], 900)).toEqual({ from: 40, to: 950 });
  });

  it('is today alone when there is nothing drawn yet', () => {
    expect(annotationSpan([], 100)).toEqual({ from: 100, to: 100 });
  });
});

/* Six kinds join the seven, all of them moments, and each one stands for a
   record somebody can open. */
describe('a marker that goes somewhere', () => {
  const marker = (id: string, at: number, href?: string): ChartAnnotationSource => ({
    id,
    kind: 'sideEffect',
    name: id,
    startEpochDay: at,
    endEpochDay: null,
    href
  });

  it('carries the record\'s address through selection', () => {
    const found = annotationsInRange([marker('headaches', 50, '/settings/side-effects')], {
      from: 40,
      to: 60,
      today: 60
    });
    expect(found[0].href).toBe('/settings/side-effects');
  });

  it('leaves an annotation that stands for no one record without one', () => {
    const found = annotationsInRange([milestone('first shot', 50)], { from: 40, to: 60, today: 60 });
    expect(found[0].href).toBeUndefined();
  });

  it('keeps the address when a wider range is narrowed', () => {
    const wide = annotationsInRange([marker('headaches', 50, '/settings/side-effects')], {
      from: 10,
      to: 90,
      today: 90
    });
    expect(narrowAnnotations(wide, 40, 60)[0].href).toBe('/settings/side-effects');
  });

  /* All six are days, not stretches: a side effect logged on a day, an
     injection given on one, a count or a reading that stood out on one. A
     kind that came back as a span would be drawn as a band across the plot. */
  it('draws every new kind as a moment', () => {
    const kinds = [
      'sideEffect',
      'injection',
      'tallyMisgendered',
      'tallyCorrectlyGendered',
      'bodyRegionDysphoria',
      'bodyRegionEuphoria'
    ] as const;

    const found = annotationsInRange(
      kinds.map((kind, i) => ({ id: kind, kind, name: null, startEpochDay: 50 + i, endEpochDay: null })),
      { from: 40, to: 60, today: 60 }
    );

    expect(found).toHaveLength(kinds.length);
    expect(found.every((a) => a.shape === 'point')).toBe(true);
  });

  /* Gathered like any other moment, so a fortnight of daily injections is
     one mark that names them all rather than fourteen ticks in a smear. */
  it('gathers markers that land together, keeping all of them', () => {
    const placed = placeAnnotations(
      annotationsInRange(
        [marker('a', 50, '/doses'), marker('b', 51, '/doses'), marker('c', 80, '/doses')],
        { from: 50, to: 90, today: 90 }
      ),
      daily(50, 41),
      100
    );

    expect(placed.marks).toHaveLength(2);
    expect(placed.marks[0].annotations.map((a) => a.id)).toEqual(['a', 'b']);
    expect(MIN_MARK_GAP).toBeGreaterThan(0);
  });
});
