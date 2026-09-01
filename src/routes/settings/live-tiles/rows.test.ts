/* The registry one screen renders (phase 6 ticket 02, generalised from
   ticket 51's original): every kind the app may show or fire unprompted is a
   row here, and a later ticket adds an entry to this array rather than new
   markup. Held at the level a module with no DOM can be: what is listed,
   under which preference, and what a fresh install defaults to. */

import { describe, expect, it } from 'vitest';
import { PREFERENCE_DEFAULTS, type PreferenceKey } from '../../../lib/data/prefs/catalogue.ts';
import { LIVE_TILE_ROWS, UNPROMPTED_KINDS, unregisteredKinds } from './rows.ts';

const kindKeys = LIVE_TILE_ROWS.map((row) => row.prefKey);
const notifyKeys = LIVE_TILE_ROWS.flatMap((row) => (row.notify ? [row.notify.prefKey] : []));

describe('the unprompted registry', () => {
  it('lists every kind the consolidated entry owns (ticket 51)', () => {
    expect(kindKeys).toEqual([
      'wearTimerEnabled',
      'dosePanelEnabled',
      'readyLetterEnabled',
      'surgeryCountdownEnabled',
      'safeSpaceNudgeEnabled',
      'stockNoticeEnabled',
      'activeTryoutTileEnabled',
      'patchScheduleTileEnabled',
      'voiceBenchmarkNudgeEnabled',
      'pauseActiveBannerEnabled',
      'hairRemovalRecoveryEnabled',
      'measurementsNudgeEnabled',
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

  it('surfaces every kind on the surfaces view - nothing registered so far fires with no settings home', () => {
    for (const row of LIVE_TILE_ROWS) expect(row.surfaces).toBe(true);
  });

  it('declares a channel for every kind that fires, and disguises both of today\'s two', () => {
    const firing = LIVE_TILE_ROWS.filter((row) => row.notify);
    expect(firing.map((row) => row.key)).toEqual(['wrapped', 'on-this-day']);
    for (const row of firing) {
      expect(row.notify?.channel).toBe('retrospective');
      expect(row.notify?.disguised).toBe(true);
    }
  });

  it('the completeness check can fail: a shortened registry names exactly the kind it is missing', () => {
    const shortened = LIVE_TILE_ROWS.filter((row) => row.key !== 'wrapped');
    expect(unregisteredKinds(shortened)).toEqual(['wrapped']);
  });

  it('reports nothing missing for the real registry', () => {
    expect(unregisteredKinds(LIVE_TILE_ROWS)).toEqual([]);
  });

  it('registers every kind exactly once', () => {
    expect(LIVE_TILE_ROWS.map((row) => row.key)).toEqual(UNPROMPTED_KINDS);
  });
});
