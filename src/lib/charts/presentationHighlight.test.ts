import { describe, expect, it } from 'vitest';

import { bucketStart } from './grain';
import { highlightedPositions } from './presentationHighlight';

describe('which chart positions a presentation lands on', () => {
  it('on the calendar axis, hits the day itself at day grain', () => {
    expect(highlightedPositions([100, 103], null, 'day')).toEqual(new Set([100, 103]));
  });

  it('on the calendar axis, hits the bucket a day falls in at a coarser grain', () => {
    const monday = bucketStart(100, 'week');
    // A day two days into the same week as day 100 shares its bucket; a day
    // three weeks later does not.
    const positions = highlightedPositions([100, monday + 2, monday + 21], null, 'week');
    expect(positions.size).toBe(2);
    expect(positions.has(monday)).toBe(true);
  });

  it('one highlighted day is enough - no evidence floor', () => {
    expect(highlightedPositions([100], null, 'day')).toEqual(new Set([100]));
  });

  it('an empty set highlights nothing', () => {
    expect(highlightedPositions([], null, 'day')).toEqual(new Set());
  });

  it('on an anchored axis, maps a day to days-since-anchor', () => {
    const keying = { type: 'anchored' as const, anchorEpochDay: 100, todayEpochDay: 200 };
    expect(highlightedPositions([100, 105, 90], keying)).toEqual(new Set([0, 5, -10]));
  });

  it('an anchored axis drops a day past today, the same rule the series itself follows', () => {
    const keying = { type: 'anchored' as const, anchorEpochDay: 100, todayEpochDay: 150 };
    expect(highlightedPositions([100, 160], keying)).toEqual(new Set([0]));
  });

  it('on a repeating axis, maps a day to its offset within whichever completed interval covers it', () => {
    const keying = {
      type: 'repeating' as const,
      intervals: [
        { startEpochDay: 100, length: 14 },
        { startEpochDay: 114, length: 14 }
      ]
    };
    // day 100 is offset 0 of the first interval -> position 1
    // day 120 is offset 6 of the second interval -> position 7
    expect(highlightedPositions([100, 120], keying)).toEqual(new Set([1, 7]));
  });

  it('a repeating axis never floors a position to three days, unlike rekeyDaySeries', () => {
    const keying = {
      type: 'repeating' as const,
      intervals: [{ startEpochDay: 100, length: 14 }]
    };
    expect(highlightedPositions([100], keying)).toEqual(new Set([1]));
  });

  it('a day outside every completed interval is dropped', () => {
    const keying = {
      type: 'repeating' as const,
      intervals: [{ startEpochDay: 100, length: 14 }]
    };
    expect(highlightedPositions([50], keying)).toEqual(new Set());
  });

  it('folds re-keyed positions to the same width the plotted series was folded to', () => {
    const keying = { type: 'anchored' as const, anchorEpochDay: 0, todayEpochDay: 1000 };
    // Position 23 folds to bucket 20 at width 10.
    expect(highlightedPositions([23], keying, 'day', 10)).toEqual(new Set([20]));
  });
});
