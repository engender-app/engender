import { describe, expect, it } from 'vitest';

import type { Era, Milestone } from './types';
import { timelineItems } from './timelineItems';
import { placeEraLabel, timelineEraBands } from './timelineEraBands';

const TODAY = 20500;

const milestone = (id: string, epochDay: number): Milestone => ({
  id,
  name: id,
  epochDay,
  description: '',
  templateKey: null,
  photo: null
});

const era = (id: string, startEpochDay: number | null, endEpochDay: number | null): Era => ({
  id,
  name: id,
  startEpochDay,
  endEpochDay
});

const shape = (items: ReturnType<typeof timelineItems>, eras: readonly Era[]) =>
  timelineEraBands(items, eras, TODAY).map((band) => [band.id, band.startIndex, band.endIndex]);

describe('the milestone rail draws each era as a band behind its own rows', () => {
  it('spans from the first row it covers to the last', () => {
    const items = timelineItems(
      [milestone('a', TODAY - 400), milestone('b', TODAY - 300), milestone('c', TODAY - 100)],
      TODAY
    );
    expect(shape(items, [era('e1', TODAY - 350, TODAY - 200)])).toEqual([['e1', 1, 1]]);
  });

  it('draws nothing for an era with no row inside it', () => {
    const items = timelineItems([milestone('a', TODAY - 400), milestone('b', TODAY - 100)], TODAY);
    expect(shape(items, [era('empty', TODAY - 300, TODAY - 250)])).toEqual([]);
  });

  it('an open start reaches back to whatever the earliest row is', () => {
    const items = timelineItems([milestone('a', TODAY - 400), milestone('b', TODAY - 100)], TODAY);
    expect(shape(items, [era('e1', null, TODAY - 200)])).toEqual([['e1', 0, 0]]);
  });

  it('an open end runs to today, covering the today row', () => {
    const items = timelineItems([milestone('a', TODAY - 100)], TODAY);
    expect(shape(items, [era('e1', TODAY - 200, null)])).toEqual([['e1', 0, 1]]);
  });

  it('skips an era that has not started yet', () => {
    const items = timelineItems([milestone('a', TODAY - 100), milestone('b', TODAY + 100)], TODAY);
    expect(shape(items, [era('future', TODAY + 10, TODAY + 50)])).toEqual([]);
  });

  it('covers a compressed gap row the era falls inside', () => {
    const items = timelineItems([milestone('a', TODAY - 1000), milestone('b', TODAY - 100)], TODAY);
    // The two milestones are more than TIMELINE_GAP_DAYS apart, so a gap row
    // sits between them (index 1) - an era wholly inside that gap still
    // covers it, since the rail's axis runs through a gap without a break.
    expect(shape(items, [era('e1', TODAY - 700, TODAY - 600)])).toEqual([['e1', 1, 1]]);
  });

  it('every era with a row keeps its own band, in registry order', () => {
    const items = timelineItems([milestone('a', TODAY - 400), milestone('b', TODAY - 100)], TODAY);
    expect(shape(items, [era('e1', TODAY - 500, TODAY - 350), era('e2', TODAY - 150, null)])).toEqual([
      ['e1', 0, 0],
      ['e2', 1, 2]
    ]);
  });
});

/* Pixels on the rail, worked by hand: a band is placed by its rows, a dot's
   ring is the 12px circle plus its 4px cut-out, and a name needs its own
   length plus 4px of band either side before it reads as clear of a ring. */
describe("the milestone rail keeps an era's name clear of the dots on its band", () => {
  it('lengthens the band at its open end when the name does not fit above a today dot', () => {
    // "Full time" in the demo journal: a gap row and the today row, 64px,
    // lengthened to 88 by the rough per-letter allowance. Today's ring sits
    // at 42-62, which leaves 54px above it for a 50px name; it needs 58.
    const placed = placeEraLabel({ top: 0, height: 64 }, [[42, 62]], 50, 88);
    expect(placed).toEqual({ top: -16, height: 92, labelTop: 0, labelHeight: 58 });
  });

  it('leaves a band whose name already fits where its rows put it', () => {
    expect(placeEraLabel({ top: 0, height: 200 }, [[80, 100]], 50, 48)).toEqual({
      top: 0,
      height: 200,
      labelTop: 100,
      labelHeight: 100
    });
  });

  it('still lengthens a short band around its own middle', () => {
    expect(placeEraLabel({ top: 100, height: 40 }, [], 50, 88)).toEqual({
      top: 76,
      height: 88,
      labelTop: 0,
      labelHeight: 88
    });
  });

  it('lengthens at the bottom when the dot sits at the top', () => {
    // A first milestone's dot near the band's top edge, its ring poking 2px
    // above it: 82px below the ring for a 90px name that needs 98.
    expect(placeEraLabel({ top: 0, height: 100 }, [[-2, 18]], 90, 48)).toEqual({
      top: 0,
      height: 116,
      labelTop: 18,
      labelHeight: 98
    });
  });

  it('lengthens a band with no dots around its middle when large text outgrows it', () => {
    // 200% text: the rough per-letter allowance gave 88px, the name is 100.
    expect(placeEraLabel({ top: 0, height: 88 }, [], 100, 88)).toEqual({
      top: -10,
      height: 108,
      labelTop: 0,
      labelHeight: 108
    });
  });

  it('moves a name squeezed between two dots out to an end of the band', () => {
    expect(placeEraLabel({ top: 0, height: 100 }, [[10, 30], [70, 90]], 60, 48)).toEqual({
      top: -58,
      height: 158,
      labelTop: 0,
      labelHeight: 68
    });
  });

  it('never lengthens a band that ends on the today row any further into the future', () => {
    // An era that started after the last milestone covers only the 20px
    // today row (dot ring at -2-18). Lengthened to 88 around its middle,
    // it has 32px above the ring and 36 below; a 50px name needs 58. The
    // roomier end is below, but below today is the future, so it grows up.
    expect(placeEraLabel({ top: 0, height: 20 }, [[-2, 18]], 50, 88, { endsToday: true })).toEqual({
      top: -60,
      height: 114,
      labelTop: 0,
      labelHeight: 58
    });
  });
});
