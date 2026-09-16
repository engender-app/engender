import { describe, expect, it } from 'vitest';

import type { Era, Milestone } from './types';
import { timelineItems } from './timelineItems';
import { timelineEraBands } from './timelineEraBands';

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
