/* Audit item 4: what settings chrome borrows to light a tab. Module state
   like smart-back.ts's own depth counter, so each case sets up the history
   it needs rather than relying on another test's leftover call. */
import { describe, expect, it } from 'vitest';

import { chromeTabOrigin, noteTabVisit } from './chrome-tab-origin.ts';

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
