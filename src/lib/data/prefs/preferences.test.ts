/* Preferences against a real SQLite engine through the driver interface
   (test-support/node-sqlite-driver.ts), not a hand-written fake, so the
   SQL these tests exercise is the SQL the browser runs. */

import { test, expect } from 'vitest';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { BOOT_KEYS, PREFERENCE_DEFAULTS } from './catalogue.ts';
import { openPreferences, type BootPreferences, type PreferenceCache } from './preferences.ts';

function recordingCache() {
  const writes: BootPreferences[] = [];
  let stored: Partial<BootPreferences> = {};
  const cache: PreferenceCache = {
    read: () => stored,
    write(boot) {
      stored = { ...boot };
      writes.push({ ...boot });
    },
    clear() {
      stored = {};
    }
  };
  return { cache, writes, current: () => stored };
}

test('a fresh database reads back the defaults', async () => {
  const prefs = await openPreferences(await migratedDb());

  expect(prefs.all()).toEqual(PREFERENCE_DEFAULTS);
  expect(prefs.openedEmpty()).toBe(true);
});

test('a written preference survives reopening the database', async () => {
  const driver = await migratedDb();
  const first = await openPreferences(driver);
  await first.set('name', 'Alicja');
  await first.set('lastBackupAt', 1_760_000_000_000);

  const second = await openPreferences(driver);

  expect(second.get('name')).toBe('Alicja');
  expect(second.get('lastBackupAt')).toBe(1_760_000_000_000);
  expect(second.openedEmpty()).toBe(false);
});

test('writing the same key twice updates the row rather than failing on the primary key', async () => {
  const driver = await migratedDb();
  const prefs = await openPreferences(driver);

  await prefs.set('palette', 'pansexual');
  await prefs.set('palette', 'nonbinary');

  expect(prefs.get('palette')).toBe('nonbinary');
  expect(await driver.query('SELECT COUNT(*) AS n FROM pref')).toEqual([{ n: 1 }]);
});

test('round-trips every value shape a preference can hold', async () => {
  const driver = await migratedDb();
  const written = await openPreferences(driver);

  await written.set('disguise', true);
  await written.set('metricDimension', 'g-voice');
  await written.set('metricKind', 'dimension');
  await written.set('lastBackupAt', null);
  await written.set('pinHash', null);

  const reread = await openPreferences(driver);

  expect(reread.get('disguise')).toBe(true);
  expect(reread.get('metricDimension')).toBe('g-voice');
  expect(reread.get('metricKind')).toBe('dimension');
  expect(reread.get('lastBackupAt')).toBe(null);
  expect(reread.get('pinHash')).toBe(null);
});

test('SQLite wins over the cache, because the cache is only a cache', async () => {
  const driver = await migratedDb();
  const seeded = await openPreferences(driver);
  await seeded.set('palette', 'nonbinary');

  const { cache } = recordingCache();
  cache.write({
    theme: 'system',
    palette: 'stale-from-a-past-session',
    language: 'system',
    lockOnLeave: false,
    disguise: false
  });

  const prefs = await openPreferences(driver, cache);

  expect(prefs.get('palette')).toBe('nonbinary');
});

test('every write refreshes the whole boot set in the cache', async () => {
  const { cache, writes, current } = recordingCache();
  const prefs = await openPreferences(await migratedDb(), cache);

  await prefs.set('theme', 'dark');

  expect(current().theme).toBe('dark');
  expect(Object.keys(writes.at(-1)!).sort()).toEqual([...BOOT_KEYS].sort());
});

test('writing a preference outside the boot set still refreshes the cache', async () => {
  const { cache, writes } = recordingCache();
  const prefs = await openPreferences(await migratedDb(), cache);
  const before = writes.length;

  await prefs.set('name', 'Alicja');

  expect(writes.length).toBe(before + 1);
  expect(writes.at(-1)).not.toHaveProperty('name');
});

test('opening seeds the cache, so a first-ever boot has something to read next time', async () => {
  const { cache, current } = recordingCache();

  await openPreferences(await migratedDb(), cache);

  expect(current().theme).toBe(PREFERENCE_DEFAULTS.theme);
  expect(current().palette).toBe(PREFERENCE_DEFAULTS.palette);
});

test('a preference this build does not know is left alone rather than crashing the read', async () => {
  const driver = await migratedDb();
  await driver.run('INSERT INTO pref (key, value) VALUES (?, ?)', ['fromANewerBuild', '"hello"']);

  const prefs = await openPreferences(driver);

  expect(prefs.all()).toEqual(PREFERENCE_DEFAULTS);
  expect(await driver.query('SELECT value FROM pref WHERE key = ?', ['fromANewerBuild'])).toEqual([
    { value: '"hello"' }
  ]);
});

test('works without a cache at all, which is what the Node tier and Android boot look like', async () => {
  const prefs = await openPreferences(await migratedDb());

  await prefs.set('theme', 'dark');

  expect(prefs.get('theme')).toBe('dark');
});
