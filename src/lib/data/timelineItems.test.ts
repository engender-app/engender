import { describe, expect, it } from 'vitest';

import type { Milestone } from './types';
import { TIMELINE_GAP_DAYS, timelineItems } from './timelineItems';

const TODAY = 20500;

const milestone = (id: string, epochDay: number): Milestone => ({
  id,
  name: id,
  epochDay,
  description: '',
  templateKey: null,
  photo: null
});

const shape = (items: ReturnType<typeof timelineItems>) => items.map((item) => item.id);

describe('the timeline rail', () => {
  it('draws nothing at all with no milestones', () => {
    expect(timelineItems([], TODAY)).toEqual([]);
  });

  it('marks today between the last one behind and the first one ahead', () => {
    const items = timelineItems([milestone('past', TODAY - 30), milestone('soon', TODAY + 30)], TODAY);
    expect(shape(items)).toEqual(['past', 'today', 'soon']);
  });

  /* The case the screen this replaces got wrong: it only inserted the marker
     between two milestones, so a journal looking entirely forward drew a
     timeline of the future with no present on it. */
  it('opens on today where every milestone is still ahead', () => {
    const items = timelineItems([milestone('soon', TODAY + 10), milestone('later', TODAY + 20)], TODAY);
    expect(shape(items)).toEqual(['today', 'soon', 'later']);
  });

  it('closes on today where every milestone is behind', () => {
    const items = timelineItems([milestone('old', TODAY - 200), milestone('recent', TODAY - 10)], TODAY);
    expect(shape(items)).toEqual(['old', 'recent', 'today']);
  });

  it('counts a milestone dated today as behind rather than ahead', () => {
    expect(shape(timelineItems([milestone('now', TODAY)], TODAY))).toEqual(['now', 'today']);
  });

  it('marks today once, however many milestones follow it', () => {
    const items = timelineItems(
      [milestone('a', TODAY + 1), milestone('b', TODAY + 2), milestone('c', TODAY + 3)],
      TODAY
    );
    expect(items.filter((item) => item.kind === 'today')).toHaveLength(1);
  });
});

describe('the compressed gaps', () => {
  it('compresses a stretch longer than the bar and names both its ends', () => {
    const from = TODAY - TIMELINE_GAP_DAYS - 400;
    const items = timelineItems([milestone('first', from), milestone('second', TODAY - 300)], TODAY);
    expect(shape(items)).toEqual(['first', 'gap-second', 'second', 'today']);
    expect(items[1]).toMatchObject({ kind: 'gap', fromEpochDay: from, toEpochDay: TODAY - 300 });
  });

  it('leaves an ordinary stretch as ordinary spacing', () => {
    const items = timelineItems(
      [milestone('first', TODAY - TIMELINE_GAP_DAYS), milestone('second', TODAY - 1)],
      TODAY
    );
    expect(shape(items)).toEqual(['first', 'second', 'today']);
  });

  it('measures the gap from the milestone before it, not from the rail\'s start', () => {
    const items = timelineItems(
      [
        milestone('a', TODAY - 900),
        milestone('b', TODAY - 890),
        milestone('c', TODAY - 10)
      ],
      TODAY
    );
    expect(shape(items)).toEqual(['a', 'b', 'gap-c', 'c', 'today']);
  });
});
