/* The batch half of scroll-region only. The scroll half reads and writes a
   real element and belongs to the browser tier; these two functions hold a
   map and touch no document, which is the whole reason they are testable
   here (phase 8 features ticket 66). */
import { describe, expect, it } from 'vitest';

import { rememberBatches, restoredBatches } from './scroll-region';

describe('batches remembered per screen', () => {
  it('starts a screen nobody has grown at one batch', () => {
    expect(restoredBatches('/never-visited', 'sessions')).toBe(1);
  });

  it('gives a screen back the count it was left at', () => {
    rememberBatches('/practice/wear', 'sessions', 4);
    expect(restoredBatches('/practice/wear', 'sessions')).toBe(4);
  });

  it('keeps the count for a second return, rather than consuming it', () => {
    rememberBatches('/doses', 'log', 3);
    expect(restoredBatches('/doses', 'log')).toBe(3);
    expect(restoredBatches('/doses', 'log')).toBe(3);
  });

  /* A screen can hold more than one batched list, and growing one is not
     growing the other - the same reason search pages its two reads with two
     counters rather than one. */
  it('counts two lists on one screen separately', () => {
    rememberBatches('/search', 'entries', 5);
    rememberBatches('/search', 'elsewhere', 2);
    expect(restoredBatches('/search', 'entries')).toBe(5);
    expect(restoredBatches('/search', 'elsewhere')).toBe(2);
  });

  it('counts the same list on two screens separately', () => {
    rememberBatches('/a', 'log', 6);
    rememberBatches('/b', 'log', 2);
    expect(restoredBatches('/a', 'log')).toBe(6);
    expect(restoredBatches('/b', 'log')).toBe(2);
  });

  it('never hands back less than one batch', () => {
    rememberBatches('/odd', 'log', 0);
    expect(restoredBatches('/odd', 'log')).toBe(1);
  });
});
