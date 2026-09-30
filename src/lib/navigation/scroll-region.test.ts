/* The batch half of scroll-region only. The scroll half reads and writes a
   real element and belongs to the browser tier; these two functions hold a
   map and touch no document, which is the whole reason they are testable
   here (phase 8 features ticket 66). `hashRowId` joins them for the same
   reason (ticket 67): called with an explicit hash, it touches no `location`
   either. */
import { afterEach, describe, expect, it } from 'vitest';

import { hashRowId, rememberBatches, rememberScroll, restoredBatches, savedScroll } from './scroll-region';

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

describe('hashRowId', () => {
  it('is null for no hash at all', () => {
    expect(hashRowId('')).toBeNull();
  });

  it('decodes the id a hash names', () => {
    expect(hashRowId('#abc-123')).toBe('abc-123');
  });

  it('decodes a percent-encoded id the same way getElementById would need it', () => {
    expect(hashRowId('#a%20b')).toBe('a b');
  });
});

/* What the transition asks before the region has got anywhere (ticket 285):
   where a screen was left, which is where the eased restore is about to take
   it. rememberScroll reads the one element, so it is stubbed. */
describe('savedScroll', () => {
  const stubRegion = (scrollTop: number) => {
    (globalThis as Record<string, unknown>).document = { querySelector: () => ({ scrollTop }) };
  };
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).document;
  });

  it('is where the screen was left', () => {
    stubRegion(634);
    rememberScroll('/calendar');
    expect(savedScroll('/calendar')).toBe(634);
  });

  it('is 0 for a screen never scrolled, one left at the top, and no path', () => {
    stubRegion(0);
    rememberScroll('/stats');
    expect(savedScroll('/stats')).toBe(0);
    expect(savedScroll('/never-visited')).toBe(0);
    expect(savedScroll(null)).toBe(0);
    expect(savedScroll(undefined)).toBe(0);
  });

  it('remembers each path on its own', () => {
    stubRegion(120);
    rememberScroll('/a');
    stubRegion(340);
    rememberScroll('/b');
    expect(savedScroll('/a')).toBe(120);
    expect(savedScroll('/b')).toBe(340);
  });
});
