/* The registry one screen renders (ticket 51): every kind Home may show or
   fire unprompted is a row here, and a later tile ticket adds an entry to
   this array rather than new markup. Held at the level a module with no
   DOM can be: what is listed, under which preference, and what a fresh
   install defaults to. */

import { describe, expect, it } from 'vitest';
import { PREFERENCE_DEFAULTS, type PreferenceKey } from '../../../lib/data/prefs/catalogue.ts';
import { LIVE_TILE_ROWS } from './rows.ts';

const kindKeys = LIVE_TILE_ROWS.map((row) => row.prefKey);
const notifyKeys = LIVE_TILE_ROWS.flatMap((row) => (row.notify ? [row.notify.prefKey] : []));

describe('the live-tiles registry', () => {
  it('lists every kind the consolidated entry owns (ticket 51)', () => {
    expect(kindKeys).toEqual([
      'wearTimerEnabled',
      'dosePanelEnabled',
      'readyLetterEnabled',
      'surgeryCountdownEnabled',
      'safeSpaceNudgeEnabled',
      'stockNoticeEnabled',
      'wrappedEnabled',
      'onThisDayEnabled'
    ]);
  });

  it('nests the two notification sub-toggles under their own kinds, on the same keys as today', () => {
    expect(notifyKeys).toEqual(['wrappedNotificationsEnabled', 'onThisDayNotificationsEnabled']);
    expect(LIVE_TILE_ROWS.find((row) => row.key === 'wrapped')?.notify?.prefKey).toBe('wrappedNotificationsEnabled');
    expect(LIVE_TILE_ROWS.find((row) => row.key === 'on-this-day')?.notify?.prefKey).toBe('onThisDayNotificationsEnabled');
  });

  it('names a real, boolean preference for every switch it draws', () => {
    for (const key of [...kindKeys, ...notifyKeys]) {
      expect(typeof PREFERENCE_DEFAULTS[key as PreferenceKey]).toBe('boolean');
    }
  });

  it('defaults every kind to on, and every notification to off, on a fresh install', () => {
    for (const key of kindKeys) expect(PREFERENCE_DEFAULTS[key as PreferenceKey]).toBe(true);
    for (const key of notifyKeys) expect(PREFERENCE_DEFAULTS[key as PreferenceKey]).toBe(false);
  });

  it('gives every row a key of its own, for the walkthrough handle', () => {
    expect(new Set(LIVE_TILE_ROWS.map((row) => row.key)).size).toBe(LIVE_TILE_ROWS.length);
  });

  it('says something about every row and every nested sub-toggle', () => {
    for (const row of LIVE_TILE_ROWS) {
      expect(row.title()).toBeTruthy();
      expect(row.subtitle()).toBeTruthy();
      if (row.notify) {
        expect(row.notify.title()).toBeTruthy();
        expect(row.notify.subtitle()).toBeTruthy();
      }
    }
  });
});
