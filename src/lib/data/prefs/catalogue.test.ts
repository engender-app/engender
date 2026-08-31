/* The allowlist has to stay total (ADR-0003): every preference is either
   portable or device-local, and adding one without deciding which is the
   failure this file exists to catch. */

import { test, expect } from 'vitest';
import {
  BOOT_KEYS,
  DEVICE_LOCAL_KEYS,
  PORTABLE_KEYS,
  PREFERENCE_DEFAULTS,
  isPreferenceKey,
  type PreferenceKey
} from './catalogue.ts';

const allKeys = Object.keys(PREFERENCE_DEFAULTS);

test('every preference is either portable or device-local', () => {
  const classified = new Set<string>([...PORTABLE_KEYS, ...DEVICE_LOCAL_KEYS]);
  const unclassified = allKeys.filter((key) => !classified.has(key));

  expect(unclassified).toEqual([]);
});

test('no preference is both portable and device-local', () => {
  const portable = new Set<string>(PORTABLE_KEYS);
  const both = DEVICE_LOCAL_KEYS.filter((key) => portable.has(key));

  expect(both).toEqual([]);
});

test('the allowlists name only real preferences', () => {
  const named = [...PORTABLE_KEYS, ...DEVICE_LOCAL_KEYS, ...BOOT_KEYS];

  expect(named.filter((key) => !isPreferenceKey(key))).toEqual([]);
});

test('the boot set is exactly the pre-database preferences, and never the PIN hash', () => {
  expect([...BOOT_KEYS].sort()).toEqual(
    ['disguise', 'language', 'lockOnLeave', 'palette', 'moodPreset', 'theme', 'a11yTextSizeBoost', 'a11yLegibilityBoost', 'a11yMotionReduce', 'bioOptIn'].sort()
  );
  // The mirror is plaintext localStorage. The hash of a 4-digit PIN in it
  // would be an offline-guessable secret sitting beside the encrypted
  // journal (ticket 09) - it lives only in the pref table now.
  expect([...BOOT_KEYS]).not.toContain('pinHash');
});

test('the boot set cuts across the portable split rather than following it', () => {
  const portable = new Set<string>(PORTABLE_KEYS);

  expect(BOOT_KEYS.filter((key) => portable.has(key))).toEqual(['theme', 'palette', 'moodPreset', 'language']);
  expect(BOOT_KEYS.filter((key) => !portable.has(key))).toEqual([
    'a11yTextSizeBoost',
    'a11yLegibilityBoost',
    'a11yMotionReduce',
    'lockOnLeave',
    'disguise',
    'bioOptIn'
  ]);
});

/* Ticket 51: every live tile and every unprompted notice is switchable as a
   kind, in one consolidated Settings entry. A fresh install shows all of
   them - the same default wrapped and on-this-day already carry - so the
   toggles exist for opting out, never in. */
test('every live-tile kind is switchable and defaults to on (ticket 51)', () => {
  for (const key of [
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
    'measurementsNudgeEnabled'
  ]) {
    expect(PREFERENCE_DEFAULTS[key as PreferenceKey]).toBe(true);
    expect(DEVICE_LOCAL_KEYS).toContain(key);
    expect(PORTABLE_KEYS).not.toContain(key);
  }
});

test('every entry contextual card is switchable and defaults to on', () => {
  for (const key of [
    'entryTryoutPromptEnabled',
    'entryDoseQuickLogEnabled',
    'entryProcedureRecoveryEnabled',
    'entryHrtEffectsEnabled'
  ]) {
    expect(PREFERENCE_DEFAULTS[key as PreferenceKey]).toBe(true);
    expect(DEVICE_LOCAL_KEYS).toContain(key);
    expect(PORTABLE_KEYS).not.toContain(key);
  }
});

test('cycleTrackingEnabled defaults to false and is portable (ADR-0043)', () => {
  expect(PREFERENCE_DEFAULTS.cycleTrackingEnabled).toBe(false);
  expect(PORTABLE_KEYS).toContain('cycleTrackingEnabled');
  expect(DEVICE_LOCAL_KEYS).not.toContain('cycleTrackingEnabled');
});

test('theme and language default to following the system, as the PRD asks', () => {
  expect(PREFERENCE_DEFAULTS.theme).toBe('system');
  expect(PREFERENCE_DEFAULTS.language).toBe('system');
});

test('a fresh install has not been onboarded', () => {
  expect(PREFERENCE_DEFAULTS.onboarded).toBe(false);
});

/* Ticket 35 turned the preset into a list of ticked scales, and the default
   is the three the fem+masc preset stood for, in catalogue order: a new
   install offers exactly what it offered before the list replaced the
   preset. Symmetric, not single-axis, for ticket 28's reason - the app does
   not decide in advance that a person is heading one way. */
test('a fresh journal ticks the symmetric fem+masc scales, not a single-axis set (tickets 28, 35)', () => {
  expect(PREFERENCE_DEFAULTS.activeScales).toEqual(['euphoria_dysphoria', 'femininity', 'masculinity']);
});

test('the ticked scales travel with the journal, because they describe it (ADR-0003)', () => {
  expect(PORTABLE_KEYS).toContain('activeScales');
  expect(BOOT_KEYS).not.toContain('activeScales');
});
