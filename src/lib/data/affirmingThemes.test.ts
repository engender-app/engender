import { describe, expect, it } from 'vitest';
import { AFFIRMING_THEMES_CAP, affirmingThemeCounts } from './affirmingThemes';
import type { Entry } from './types';

const entry = (tags: string[] | undefined): Entry =>
  ({ id: 1, epochDay: 1, timestamp: 0, mood: 4, tags, photos: [] }) as unknown as Entry;

describe('the affirming themes are the tags the counterevidence carries most', () => {
  it('counts every tag across the pool, most common first', () => {
    const rows = affirmingThemeCounts([
      entry(['hopeful', 'calm']),
      entry(['hopeful']),
      entry(['seen', 'hopeful']),
      entry(undefined),
      entry(['calm'])
    ]);
    expect(rows).toEqual([
      { id: 'hopeful', count: 3 },
      { id: 'calm', count: 2 },
      { id: 'seen', count: 1 }
    ]);
  });

  it('stops at the cap the Safe space card always drew', () => {
    expect(AFFIRMING_THEMES_CAP).toBe(5);
    const rows = affirmingThemeCounts([entry(['a', 'b', 'c', 'd', 'e', 'f', 'g'])]);
    expect(rows).toHaveLength(AFFIRMING_THEMES_CAP);
  });

  it('is empty over an empty pool', () => {
    expect(affirmingThemeCounts([])).toEqual([]);
  });
});
