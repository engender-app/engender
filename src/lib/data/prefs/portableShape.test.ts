import { describe, expect, test } from 'vitest';
import type { PortablePreferences } from '../archive/payload';
import { PORTABLE_KEYS, PREFERENCE_DEFAULTS } from './catalogue';
import { portablePreferencePatch, portableValueForKey } from './portableShape';

/* portablePreferencePatch is the whole of what applyPortablePreferences
   (store.svelte.ts) does with an archive: it applies exactly the keys the
   patch names and touches nothing else, so a key the patch omits is a key
   this device's own value survives untouched. store.svelte.ts is a
   `.svelte.ts` file and cannot be node-tested directly (svelte-ts-reactive-
   wrappers-cannot-be-node-tested), so this is the real boundary a test can
   reach - as close to "import this archive" as a node test gets. */

describe('importing the archive named in the audit (S6)', () => {
  test('keeps the device theme, palette and check-in time', () => {
    const patch = portablePreferencePatch({
      theme: '<script>',
      palette: '../x',
      checkInTime: 'never'
    } as unknown as Partial<PortablePreferences>);

    expect(patch).not.toHaveProperty('theme');
    expect(patch).not.toHaveProperty('palette');
    expect(patch).not.toHaveProperty('checkInTime');
  });

  test('a valid archive still applies every portable preference', () => {
    const archive = Object.fromEntries(PORTABLE_KEYS.map((key) => [key, PREFERENCE_DEFAULTS[key]]));

    expect(portablePreferencePatch(archive)).toEqual(archive);
  });

  test('an archive missing a key leaves it out of the patch, same as an invalid one', () => {
    expect(portablePreferencePatch({ theme: 'dark' })).toEqual({ theme: 'dark' });
  });
});

describe('a hostile or corrupted value, key by key', () => {
  test('an invented theme is rejected', () => {
    expect(portableValueForKey('theme', '<script>')).toBeUndefined();
  });

  test('a palette outside the slug shape is rejected', () => {
    expect(portableValueForKey('palette', '../x')).toBeUndefined();
  });

  test('a check-in time outside HH:MM is rejected', () => {
    expect(portableValueForKey('checkInTime', 'never')).toBeUndefined();
  });

  test('an out-of-range check-in time is rejected, not just a non-numeric one', () => {
    expect(portableValueForKey('checkInTime', '24:00')).toBeUndefined();
    expect(portableValueForKey('checkInTime', '12:60')).toBeUndefined();
  });

  test('a type-confused value is rejected for a boolean, a number and an array key', () => {
    expect(portableValueForKey('checkInEnabled', 'true')).toBeUndefined();
    expect(portableValueForKey('hairAnchorEpochDay', 'soon')).toBeUndefined();
    expect(portableValueForKey('hairAnchorEpochDay', Number.NaN)).toBeUndefined();
    expect(portableValueForKey('activeScales', 'euphoria_dysphoria')).toBeUndefined();
  });

  test('preferredLabUnits rejects a value that is not an object at all', () => {
    expect(portableValueForKey('preferredLabUnits', 'pg/mL')).toBeUndefined();
    expect(portableValueForKey('preferredLabUnits', ['pg/mL'])).toBeUndefined();
    expect(portableValueForKey('preferredLabUnits', null)).toBeUndefined();
  });

  test('preferredLabUnits keeps a known unit and drops an invented one, same object', () => {
    expect(portableValueForKey('preferredLabUnits', { estradiol: 'pg/mL', testosterone: 'made-up' })).toEqual({
      estradiol: 'pg/mL'
    });
  });
});

describe('a valid archive', () => {
  test('every default value passes its own key unchanged', () => {
    for (const key of PORTABLE_KEYS) {
      expect(portableValueForKey(key, PREFERENCE_DEFAULTS[key])).toEqual(PREFERENCE_DEFAULTS[key]);
    }
  });

  test('a real, non-default choice for each hand-picked field still lands', () => {
    expect(portableValueForKey('theme', 'dark')).toBe('dark');
    expect(portableValueForKey('language', 'pl')).toBe('pl');
    expect(portableValueForKey('palette', 'genderfluid')).toBe('genderfluid');
    expect(portableValueForKey('moodPreset', 'plum')).toBe('plum');
    expect(portableValueForKey('checkInTime', '07:05')).toBe('07:05');
    expect(portableValueForKey('measurementUnit', 'in')).toBe('in');
    expect(portableValueForKey('metricKind', 'dimension')).toBe('dimension');
  });

  test('a null answer stays null on every nullable key', () => {
    expect(portableValueForKey('metricDimension', null)).toBeNull();
    expect(portableValueForKey('journeyAnchorMilestoneId', null)).toBeNull();
    expect(portableValueForKey('hairAnchorEpochDay', null)).toBeNull();
    expect(portableValueForKey('pinnedRows', null)).toBeNull();
  });
});
