import { describe, expect, it } from 'vitest';

import type { TagInsight } from './journal/stats';
import {
  WRAPPED_TAG_INSIGHT_CAP,
  wrappedTagInsights
} from './wrappedSections';

const insight = (id: string, withAvg: number, withoutAvg: number, count = 5): TagInsight => ({
  id,
  count,
  withAvg,
  withoutAvg
});

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


