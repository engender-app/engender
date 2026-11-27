/* The batch half of scroll-region only. The scroll half reads and writes a
   real element and belongs to the browser tier; these two functions hold a
   map and touch no document, which is the whole reason they are testable
   here. `hashRowId` joins them for the same
   reason: called with an explicit hash, it touches no `location`
   either. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  claimScrollHold,
  hashRowId,
  holdScroll,
  rememberBatches,
  rememberScroll,
  restoreScroll,
  restoredBatches,
  savedScroll
} from './scroll-region';

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

  /* A link anyone can send (security scan GD-039): a bare `%`, a bad escape
     or a cut-off UTF-8 sequence made decodeURIComponent throw inside the
     doses, labs and regimen screens' setup, and the screen failed to draw. */
  it('is null for a malformed escape rather than throwing', () => {
    expect(hashRowId('#%')).toBeNull();
    expect(hashRowId('#%ZZ')).toBeNull();
    expect(hashRowId('#%E2%82')).toBeNull();
  });
});

/* What the transition asks before the region has got anywhere:
   where a screen was left, which is where the eased restore is about to take
   it. rememberScroll reads the one element, so it is stubbed. */
describe('savedScroll', () => {
  const stubRegion = (scrollTop: number) => {
    (globalThis as Record<string, unknown>).document = { querySelector: () => ({ scrollTop }) };
  };
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).document;
  });

  it('is where the screen was left, going back to it', () => {
    stubRegion(634);
    rememberScroll('/calendar');
    expect(savedScroll('/calendar', 'popstate')).toBe(634);
  });

  it('is the top going forward, even to a screen scrolled before', () => {
    stubRegion(634);
    rememberScroll('/calendar');
    for (const type of ['link', 'goto', 'form', 'enter']) expect(savedScroll('/calendar', type)).toBe(0);
  });

  it('is 0 for a screen never scrolled, one left at the top, and no path', () => {
    stubRegion(0);
    rememberScroll('/stats');
    expect(savedScroll('/stats', 'popstate')).toBe(0);
    expect(savedScroll('/never-visited', 'popstate')).toBe(0);
    expect(savedScroll(null, 'popstate')).toBe(0);
    expect(savedScroll(undefined, 'popstate')).toBe(0);
  });

  it('remembers each path on its own', () => {
    stubRegion(120);
    rememberScroll('/a');
    stubRegion(340);
    rememberScroll('/b');
    expect(savedScroll('/a', 'popstate')).toBe(120);
    expect(savedScroll('/b', 'popstate')).toBe(340);
  });
});

/* A screen rewriting its own address in place:
   opening a photo half way down the library sent the grid back to its first
   row, because the restore after every navigation read a `goto` as a screen
   to open at the top. The region is stubbed at 500px; a restore that goes
   to the top writes 0 straight into it. */
describe('a navigation held still by replaceRoute', () => {
  const origin = 'http://localhost';
  const at = (path: string) => new URL(path, origin);
  let el: { scrollTop: number };
  const restore = (path: string, type = 'goto') => {
    restoreScroll(at(path), type);
    return el.scrollTop;
  };
  beforeEach(() => {
    el = { scrollTop: 500 };
    (globalThis as Record<string, unknown>).document = { querySelector: () => el };
    claimScrollHold(null);
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).document;
  });

  it('leaves the region where it was', () => {
    holdScroll('/media/photos?photo=a');
    claimScrollHold(at('/media/photos?photo=a'));
    expect(restore('/media/photos?photo=a')).toBe(500);
    /* Restored twice per navigation - before a view transition's capture
       and again after it settles - and held both times. */
    expect(restore('/media/photos?photo=a')).toBe(500);
  });

  it('takes a URL object the way replaceRoute is handed one', () => {
    holdScroll(at('/media/photos?source=hair'));
    claimScrollHold(at('/media/photos?source=hair'));
    expect(restore('/media/photos?source=hair')).toBe(500);
  });

  it('still opens an ordinary goto at the top', () => {
    expect(restore('/media/photos')).toBe(0);
  });

  it('is dropped by a navigation to somewhere else, which opens at the top', () => {
    holdScroll('/media/photos?photo=a');
    claimScrollHold(at('/more'));
    expect(restore('/more')).toBe(0);
    claimScrollHold(at('/media/photos?photo=a'));
    expect(restore('/media/photos?photo=a', 'goto')).toBe(0);
  });

  it('holds one navigation only: the next one to start spends it', () => {
    holdScroll('/media/photos');
    claimScrollHold(at('/media/photos'));
    expect(restore('/media/photos')).toBe(500);
    claimScrollHold(at('/media/photos'));
    expect(restore('/media/photos', 'link')).toBe(0);
  });

  it('counts only once its own navigation has started', () => {
    holdScroll('/media/photos?photo=a');
    expect(restore('/media/photos?photo=a')).toBe(0);
  });
});
