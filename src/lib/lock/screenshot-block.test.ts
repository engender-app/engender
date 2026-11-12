/* The Security row is a blocker, the stored preference is an allowance.
   These pin the turn between them against the real preference store, so a
   row that reads the stored value the wrong way round fails here. */

import { test, expect } from 'vitest';
import { migratedDb } from '../data/sqlite/test-support/migrated-db.ts';
import { openPreferences } from '../data/prefs/preferences.ts';
import { screenshotsBlocked, setScreenshotsBlocked } from './screenshot-block.ts';

test('a fresh install shows the blocker off', async () => {
  const prefs = await openPreferences(await migratedDb());

  expect(screenshotsBlocked(prefs.all())).toBe(false);
});

test('a device that had capture blocked before the update shows the blocker on', async () => {
  const driver = await migratedDb();
  await (await openPreferences(driver)).set('allowScreenCapture', false);

  const afterUpdate = await openPreferences(driver);
  expect(screenshotsBlocked(afterUpdate.all())).toBe(true);
});

test('switching the blocker on stores the value the native side blocks on, and off restores it', () => {
  const prefs = { allowScreenCapture: true };

  setScreenshotsBlocked(prefs, true);
  expect(prefs.allowScreenCapture).toBe(false);
  expect(screenshotsBlocked(prefs)).toBe(true);

  setScreenshotsBlocked(prefs, false);
  expect(prefs.allowScreenCapture).toBe(true);
  expect(screenshotsBlocked(prefs)).toBe(false);
});
