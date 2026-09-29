import { afterEach, describe, expect, it } from 'vitest';

import { rememberScroll, savedScroll } from './scroll-region';

/* What the transition asks before the region has got anywhere (ticket 285):
   where a screen was left, which is where the eased restore is about to take
   it. */
function stubRegion(scrollTop: number) {
  (globalThis as Record<string, unknown>).document = {
    querySelector: () => ({ scrollTop })
  };
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).document;
});

describe('savedScroll', () => {
  it('is where the screen was left', () => {
    stubRegion(634);
    rememberScroll('/calendar');
    expect(savedScroll('/calendar')).toBe(634);
  });

  it('is 0 for a screen never scrolled, a screen left at the top, and no path', () => {
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
