/* Audit item 4: what settings chrome borrows to light a tab. Module state
   like smart-back.ts's own depth counter, so each case sets up the history
   it needs rather than relying on another test's leftover call. */
import { describe, expect, it } from 'vitest';

import { chromeTabOrigin, noteBorrowingArrival, noteTabVisit } from './chrome-tab-origin.ts';

describe('chromeTabOrigin', () => {
  // Module state, like smart-back.ts's own depth counter: this file's
  // tests run in order and build on what the ones before left behind
  // rather than each starting from a reset, since noteTabVisit has no way
  // to clear what it remembered short of a real navigation - a fresh app
  // never has a tab to unremember.
  it('lights none before anything has visited a real tab', () => {
    expect(chromeTabOrigin()).toBe('');
  });

  it('remembers the last tab a navigation actually lit', () => {
    noteTabVisit('home');
    expect(chromeTabOrigin()).toBe('home');
    noteTabVisit('calendar');
    expect(chromeTabOrigin()).toBe('calendar');
  });

  it('ignores a falsy key rather than clearing what it remembered', () => {
    noteTabVisit('stats');
    noteTabVisit('');
    expect(chromeTabOrigin()).toBe('stats');
  });
});

/* After-release 17 review: an editor opened from Today, left for Journal and
   come back to through browser Back borrowed Journal, since the only thing
   remembered was the last tab lit. Each borrowing page keeps the tab it was
   opened from, and history hands it back. */
describe('noteBorrowingArrival', () => {
  it('hands a returning page the tab it was first opened from', () => {
    noteTabVisit('home');
    noteBorrowingArrival('/entry/new/20000', false);
    noteTabVisit('calendar');
    noteBorrowingArrival('/entry/new/20000', true);
    expect(chromeTabOrigin()).toBe('home');
  });

  /* Second review: keyed by path alone, Today, editor, Journal, the same
     editor again, then Back twice lit Journal on the first visit, which the
     second had overwritten. The shell keys by history depth and path. */
  it('keeps two visits to one page apart when they are different history entries', () => {
    noteTabVisit('home');
    noteBorrowingArrival('1:/entry/41', false);
    noteTabVisit('calendar');
    noteBorrowingArrival('3:/entry/41', false);
    noteBorrowingArrival('1:/entry/41', true);
    expect(chromeTabOrigin()).toBe('home');
  });

  it('lets a forward visit overwrite what an earlier one kept', () => {
    noteTabVisit('stats');
    noteBorrowingArrival('/entry/41', false);
    noteTabVisit('calendar');
    noteBorrowingArrival('/entry/41', false);
    noteTabVisit('home');
    noteBorrowingArrival('/entry/41', true);
    expect(chromeTabOrigin()).toBe('calendar');
  });

  it('leaves the last tab alone on a return to a page it never saw opened', () => {
    noteTabVisit('stats');
    noteBorrowingArrival('/settings/never-opened', true);
    expect(chromeTabOrigin()).toBe('stats');
  });
});
