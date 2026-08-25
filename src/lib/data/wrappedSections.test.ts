import { describe, expect, it } from 'vitest';

import type { DayAverage, TagInsight } from './journal/stats';
import {
  WRAPPED_TAG_INSIGHT_CAP,
  wrappedStreaks,
  wrappedTagInsights,
  wrappedTallyCounts
} from './wrappedSections';

const insight = (id: string, withAvg: number, withoutAvg: number, count = 5): TagInsight => ({
  id,
  count,
  withAvg,
  withoutAvg
});
const points = (...values: number[]): DayAverage[] =>
  values.map((value, i) => ({ day: 20000 + i, value, count: value }));

describe('tag insights on a wrapped', () => {
  it('says nothing where the period has no insight to give', () => {
    expect(wrappedTagInsights([])).toBeNull();
  });

  /* The seam has already ranked and filtered; what is left is how many fit
     on a retrospective. */
  it('caps how many it names', () => {
    const many = Array.from({ length: 9 }, (_, i) => insight(`t-${i}`, 4, 3));
    expect(wrappedTagInsights(many)).toHaveLength(WRAPPED_TAG_INSIGHT_CAP);
    expect(wrappedTagInsights(many, 2)).toHaveLength(2);
  });

  it('keeps the seam\'s own order rather than resorting it', () => {
    const ranked = [insight('big', 5, 2), insight('small', 3.2, 3)];
    expect(wrappedTagInsights(ranked)?.map((i) => i.id)).toEqual(['big', 'small']);
  });

  /* Signed, and nothing more. A tag that went with lower days is a negative
     number, not a worse tag. */
  it('carries the movement in both directions, and both averages with it', () => {
    const [better, worse] = wrappedTagInsights([insight('up', 4, 3), insight('down', 2, 3.5)]) ?? [];
    expect(better).toMatchObject({ withAvg: 4, withoutAvg: 3, delta: 1 });
    expect(worse.delta).toBeCloseTo(-1.5);
  });

  it('carries the stored id, leaving the wording to display time', () => {
    expect(wrappedTagInsights([insight('g-euphoria', 4, 3)])?.[0].id).toBe('g-euphoria');
  });
});

describe('the tally counts on a wrapped', () => {
  it('says nothing where neither direction was tapped', () => {
    expect(wrappedTallyCounts([], [])).toBeNull();
    expect(wrappedTallyCounts(points(0), points(0))).toBeNull();
  });

  it('totals each kind over the period', () => {
    expect(wrappedTallyCounts(points(1, 2), points(3, 4, 5))).toEqual({
      misgendered: 3,
      correctlyGendered: 12
    });
  });

  /* One direction with nothing in it is a reading, not an empty section. */
  it('shows a period where only one direction happened', () => {
    expect(wrappedTallyCounts([], points(2, 2))).toEqual({ misgendered: 0, correctlyGendered: 4 });
    expect(wrappedTallyCounts(points(1), [])).toEqual({ misgendered: 1, correctlyGendered: 0 });
  });
});

describe('the best streak against the best ever', () => {
  it('says nothing where the period holds no run', () => {
    expect(wrappedStreaks({ bestStreak: 0 }, 31)).toBeNull();
  });

  it('pairs the period\'s own best with the history\'s', () => {
    expect(wrappedStreaks({ bestStreak: 6 }, 31)).toEqual({ inPeriod: 6, ever: 31, isBestEver: false });
  });

  it('marks the period that set the record', () => {
    expect(wrappedStreaks({ bestStreak: 31 }, 31)).toEqual({ inPeriod: 31, ever: 31, isBestEver: true });
  });

  /* The ever figure is read with today as its anchor and excludes future
     days, so a period ending in the future can hold a longer run than the
     history it is part of. Reporting a best-ever smaller than the number
     beside it would read as an error rather than as an edge. */
  it('never reports a best ever shorter than the period beside it', () => {
    expect(wrappedStreaks({ bestStreak: 9 }, 4)).toEqual({ inPeriod: 9, ever: 9, isBestEver: true });
  });
});
