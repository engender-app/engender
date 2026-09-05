/* The registry two screens render (phase 6 tickets 02 and 04): every kind
   the app may show or fire unprompted is a row here, and a later ticket adds
   an entry to this array rather than new markup. Held at the level a module
   with no DOM can be: what is listed, in which of the two views, under which
   preference, and what a fresh install defaults to. */

import { describe, expect, it } from 'vitest';
import { PREFERENCE_DEFAULTS, type PreferenceKey } from '../data/prefs/catalogue.ts';
import {
  NOTIFICATION_ROWS,
  SURFACE_ROWS,
  UNPROMPTED_ROWS,
  unpromptedQuiet,
  unregisteredKinds
} from './registry.ts';
import type { AreaStates } from '../data/areaState.ts';

const surfaceKeys = SURFACE_ROWS.map((row) => row.surface!.prefKey);
const notifyKeys = NOTIFICATION_ROWS.map((row) => row.notify!.prefKey);

describe('the unprompted registry', () => {
  it('lists every kind that shows something in the app of its own', () => {
    expect(surfaceKeys).toEqual([
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
      'onThisDayEnabled',
      'revisitEnabled'
    ]);
  });

  it('names a real, boolean preference for every switch either view draws', () => {
    for (const key of [...surfaceKeys, ...notifyKeys]) {
      expect(typeof PREFERENCE_DEFAULTS[key as PreferenceKey]).toBe('boolean');
    }
  });

  it('defaults every surface to on, on a fresh install', () => {
    for (const key of surfaceKeys) expect(PREFERENCE_DEFAULTS[key as PreferenceKey]).toBe(true);
  });

  it('gives every row a key of its own, for the walkthrough handle', () => {
    expect(new Set(UNPROMPTED_ROWS.map((row) => row.key)).size).toBe(UNPROMPTED_ROWS.length);
  });

  it('says something about every row, in whichever view draws it', () => {
    for (const row of UNPROMPTED_ROWS) {
      expect(row.title(), row.key).toBeTruthy();
      if (row.surface) expect(row.surface.subtitle(), row.key).toBeTruthy();
      if (row.notify) expect(row.notify.subtitle(), row.key).toBeTruthy();
    }
  });

  it('gives every row at least one view to appear in', () => {
    // A row in neither is a preference nothing can reach: the registry is
    // the only place either screen reads its list from.
    for (const row of UNPROMPTED_ROWS) expect(Boolean(row.surface || row.notify), row.key).toBe(true);
  });

  it('the completeness check can fail: a shortened registry names exactly the kind it is missing', () => {
    const shortened = UNPROMPTED_ROWS.filter((row) => row.key !== 'wrapped');
    expect(unregisteredKinds(shortened)).toEqual(['wrapped']);
  });
});

describe('the notifications view (ticket 04)', () => {
  it('lists all six producers, the export failure notice included', () => {
    /* The ticket's own count. Before this the four below decided for
       themselves: reminders and the check-in through AlarmManager, the wear
       prompt as a reminder row nobody had a switch for, and the failure
       notice with no settings home at all. */
    expect(NOTIFICATION_ROWS.map((row) => row.key)).toEqual([
      'wrapped',
      'on-this-day',
      'reminders',
      'check-in',
      'wear-elapsed',
      'export-failure'
    ]);
  });

  it('keeps wrapped and on-this-day on the preference keys they already had', () => {
    // Grandfathered, per the admission rule: a milestone about consent does
    // not silently withdraw behaviour people already chose.
    const notifyKeyOf = (key: string) => NOTIFICATION_ROWS.find((row) => row.key === key)?.notify?.prefKey;
    expect(notifyKeyOf('wrapped')).toBe('wrappedNotificationsEnabled');
    expect(notifyKeyOf('on-this-day')).toBe('onThisDayNotificationsEnabled');
    expect(PREFERENCE_DEFAULTS.wrappedNotificationsEnabled).toBe(false);
    expect(PREFERENCE_DEFAULTS.onThisDayNotificationsEnabled).toBe(false);
  });

  it('reuses the check-in preference rather than stacking a second switch on it', () => {
    /* `checkInEnabled` is the check-in, and it already carried its time and
       its affirmation pool. A `checkInNotificationsEnabled` beside it would
       be a switch that can only ever contradict the one next to it. */
    expect(NOTIFICATION_ROWS.find((row) => row.key === 'check-in')?.notify?.prefKey).toBe('checkInEnabled');
  });

  it('declares a channel for every row that fires', () => {
    expect(
      NOTIFICATION_ROWS.map((row) => [row.key, row.notify?.channel])
    ).toEqual([
      ['wrapped', 'retrospective'],
      ['on-this-day', 'retrospective'],
      ['reminders', 'reminders'],
      // A wear prompt is an ordinary Reminder row (CONTEXT.md), so it
      // arrives on the reminder channel rather than one of its own.
      ['check-in', 'checkIn'],
      ['wear-elapsed', 'reminders'],
      ['export-failure', 'exportFailure']
    ]);
  });

  it('disguises every registered class, including the four that joined here', () => {
    /* The verification item the ideas file flagged and nobody had run:
       `hideNotificationTitles` has to cover every class, not the two it was
       written for. Each producer's own path is where it is applied, and
       there is a test on each of those; this is the declaration they answer
       to. */
    for (const row of NOTIFICATION_ROWS) expect(row.notify?.disguised, row.key).toBe(true);
  });

  it('defaults the two scheduled-by-you kinds on and the two retrospectives off', () => {
    /* Reminders and the wear prompt already fire today for anyone who set
       one up, so a switch defaulting to off would silently stop them on
       update. The failure notice defaults on for the other half of the
       admission rule: a backup that saved nothing is worth saying. */
    expect(PREFERENCE_DEFAULTS.remindersEnabled).toBe(true);
    expect(PREFERENCE_DEFAULTS.wearElapsedEnabled).toBe(true);
    expect(PREFERENCE_DEFAULTS.exportFailureNoticeEnabled).toBe(true);
    // And the check-in stays opt-in, as it has been since it shipped.
    expect(PREFERENCE_DEFAULTS.checkInEnabled).toBe(false);
  });

  it('leaves quiet hours off, with a window somebody can accept or replace', () => {
    expect(PREFERENCE_DEFAULTS.quietHoursEnabled).toBe(false);
    expect(PREFERENCE_DEFAULTS.quietHoursStart).toBe('22:00');
    expect(PREFERENCE_DEFAULTS.quietHoursEnd).toBe('07:00');
  });

  it('gives the four that joined here no surface of their own', () => {
    // None of them shows anything inside the app, so none belongs on the
    // surfaces view - which is the whole reason `surface` is optional.
    for (const key of ['reminders', 'check-in', 'wear-elapsed', 'export-failure']) {
      expect(NOTIFICATION_ROWS.find((row) => row.key === key)?.surface, key).toBeUndefined();
    }
  });

  /* Phase 8 features ticket 04: the cascade. An area that is hidden or
     finished takes its tiles and its notifications with it, and this is the
     list that says which are whose. */

  it('names an area for the five kinds that belong to one, and none for the rest', () => {
    const withArea = UNPROMPTED_ROWS.filter((row) => row.area !== null).map((row) => [row.key, row.area]);

    expect(withArea).toEqual([
      ['wear-timer', 'wearSessions'],
      ['voice-benchmark-nudge', 'voiceBenchmarks'],
      ['hair-removal-recovery', 'hairRemovalSessions'],
      ['measurements-nudge', 'measurements'],
      ['wear-elapsed', 'wearSessions']
    ]);
  });

  it('silences a kind when its area is finished, and leaves the others talking', () => {
    const states: AreaStates = { measurements: { hidden: false, finishedEpochDay: 19900, suspendedEpochDay: null } };

    expect(unpromptedQuiet('measurements-nudge', states, 20000)).toBe(true);
    expect(unpromptedQuiet('wear-timer', states, 20000)).toBe(false);
    expect(unpromptedQuiet('ready-letter', states, 20000)).toBe(false);
  });

  it('silences both kinds an area owns, the notification as well as the tile', () => {
    const states: AreaStates = { wearSessions: { hidden: true, finishedEpochDay: null, suspendedEpochDay: null } };

    expect(unpromptedQuiet('wear-timer', states, 20000)).toBe(true);
    expect(unpromptedQuiet('wear-elapsed', states, 20000)).toBe(true);
  });

  it('says nothing about a kind that belongs to no area, whatever the states hold', () => {
    const everything: AreaStates = Object.fromEntries(
      UNPROMPTED_ROWS.filter((row) => row.area !== null).map((row) => [
        row.area,
        { hidden: true, finishedEpochDay: null, suspendedEpochDay: null }
      ])
    );

    for (const row of UNPROMPTED_ROWS.filter((r) => r.area === null)) {
      expect(unpromptedQuiet(row.key, everything, 20000), row.key).toBe(false);
    }
  });
});
