/* The allowlist has to stay total (ADR-0003): every preference is either
   portable or device-local, and adding one without deciding which is the
   failure this file exists to catch. */

import { test, expect } from 'vitest';
import {
  BOOT_KEYS,
  DEVICE_LOCAL_KEYS,
  PORTABLE_KEYS,
  PREFERENCE_DEFAULTS,
  isPreferenceKey
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

test('the boot set is exactly the pre-database preferences', () => {
  /* The boot mirror is plaintext localStorage, read before the database is
     open (ADR-0009). What may live there is what a first paint needs -
     theme, palette, text size - and nothing that would be a secret sitting
     beside the encrypted journal.

     Until ticket 53 this test named `pinHash` as the thing that must never
     be here. That preference is gone with the gate it served, so the rule is
     stated as the rule instead: every boot key is a presentation
     preference. */
  for (const key of BOOT_KEYS) {
    expect(typeof PREFERENCE_DEFAULTS[key], key).not.toBe('undefined');
  }
  expect([...BOOT_KEYS].sort()).toEqual(
    [
      'theme',
      'palette',
      'moodPreset',
      'language',
      'a11yTextSizeBoost',
      'a11yLegibilityBoost',
      'a11yMotionReduce',
      'lockAfter',
      'disguise'
    ].sort()
  );
});

test('the boot set cuts across the portable split rather than following it', () => {
  const portable = new Set<string>(PORTABLE_KEYS);

  expect(BOOT_KEYS.filter((key) => portable.has(key))).toEqual(['theme', 'palette', 'moodPreset', 'language']);
  expect(BOOT_KEYS.filter((key) => !portable.has(key))).toEqual([
    'a11yTextSizeBoost',
    'a11yLegibilityBoost',
    'a11yMotionReduce',
    'lockAfter',
    'disguise'
  ]);
});

/* Functional audit ticket 44: the eight per-surface booleans are one map,
   `surfaceOverrides`, whose defaults live in the unprompted registry. It
   travels in an archive, like the front-page pins. */
test('the per-surface booleans are gone, replaced by one portable map (FA 44)', () => {
  for (const key of [
    'wearTimerEnabled',
    'dosePanelEnabled',
    'readyLetterEnabled',
    'surgeryCountdownEnabled',
    'safeSpaceNudgeEnabled',
    'stockNoticeEnabled',
    'wrappedEnabled',
    'onThisDayEnabled'
  ]) {
    expect(isPreferenceKey(key), key).toBe(false);
  }
  expect(PREFERENCE_DEFAULTS.surfaceOverrides).toEqual({});
  expect(PORTABLE_KEYS).toContain('surfaceOverrides');
  expect(DEVICE_LOCAL_KEYS as readonly string[]).not.toContain('surfaceOverrides');
});

/* Functional-audit ticket 14 cut four tiles and the agenda's kind
   switches. Their preferences go with them rather than lingering as keys
   nothing reads; a stored row for one is skipped on load
   (`isPreferenceKey`) and an archive's copy is never read back. */
test('the cut tiles and the agenda kind switches leave no preference behind', () => {
  for (const key of [
    'activeTryoutTileEnabled',
    'voiceBenchmarkNudgeEnabled',
    'hairRemovalRecoveryEnabled',
    'appointmentTodayEnabled',
    'agendaKinds'
  ]) {
    expect(isPreferenceKey(key), key).toBe(false);
    expect(DEVICE_LOCAL_KEYS as readonly string[]).not.toContain(key);
    expect(PORTABLE_KEYS as readonly string[]).not.toContain(key);
  }
});

/* Functional audit ticket 44: dead and legacy keys leave the catalogue. The
   entry editor's four cards always show, nothing ever wrote their switches,
   and the two legacy read-acrosses were migrated by version 117. */
test('dead and legacy keys are not preferences any more (FA 44)', () => {
  for (const key of [
    'entryTryoutPromptEnabled',
    'entryDoseQuickLogEnabled',
    'entryProcedureRecoveryEnabled',
    'entryHrtEffectsEnabled',
    'cycleTrackingEnabled',
    'lockOnLeave'
  ]) {
    expect(isPreferenceKey(key), key).toBe(false);
    expect(DEVICE_LOCAL_KEYS as readonly string[]).not.toContain(key);
    expect(PORTABLE_KEYS as readonly string[]).not.toContain(key);
  }
});

test('theme and language default to following the system, as the PRD asks', () => {
  expect(PREFERENCE_DEFAULTS.theme).toBe('system');
  expect(PREFERENCE_DEFAULTS.language).toBe('system');
});

test('a fresh install has not been onboarded', () => {
  expect(PREFERENCE_DEFAULTS.onboarded).toBe(false);
});

/* Ticket 46: the persona premise this guards against is a daily nudge
   arriving unrequested for someone who logs by event, not by day. Nothing
   in boot or onboarding is meant to flip this - the one place it turns on
   is a person switching it on themselves (onboarding/+page.svelte) or in
   settings/reminders. */
test('a fresh install has the daily check-in off (ticket 46)', () => {
  expect(PREFERENCE_DEFAULTS.checkInEnabled).toBe(false);
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

test('backup failure notification history stays on this device', () => {
  expect(PREFERENCE_DEFAULTS.lastExportFailureNotifiedAt).toBeNull();
  expect(DEVICE_LOCAL_KEYS).toContain('lastExportFailureNotifiedAt');
  expect(PORTABLE_KEYS).not.toContain('lastExportFailureNotifiedAt');
  expect(BOOT_KEYS).not.toContain('lastExportFailureNotifiedAt');
});
