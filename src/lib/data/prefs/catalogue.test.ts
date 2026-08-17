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

test('theme and language default to following the system, as the PRD asks', () => {
  expect(PREFERENCE_DEFAULTS.theme).toBe('system');
  expect(PREFERENCE_DEFAULTS.language).toBe('system');
});

test('a fresh install has not been onboarded', () => {
  expect(PREFERENCE_DEFAULTS.onboarded).toBe(false);
});
