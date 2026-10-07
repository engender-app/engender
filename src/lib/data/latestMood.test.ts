import { describe, expect, it } from 'vitest';

import { latestMood } from './latestMood.ts';

describe('latestMood', () => {
  it('answers null for a day with nothing logged', () => {
    expect(latestMood([])).toBeNull();
  });

  it('takes the latest entry that carries a mood, whatever order the entries come in', () => {
    expect(latestMood([
      { mood: 2, timestamp: 1000 },
      { mood: 5, timestamp: 3000 },
      { mood: 4, timestamp: 2000 }
    ])).toEqual({ mood: 5, timestamp: 3000 });
  });

  it('passes over a later entry with no mood, which has nothing to ring', () => {
    expect(latestMood([
      { mood: 3, timestamp: 1000 },
      { mood: null, timestamp: 4000 }
    ])).toEqual({ mood: 3, timestamp: 1000 });
  });
});
