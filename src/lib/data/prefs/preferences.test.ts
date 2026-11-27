/* Preferences against a real SQLite engine through the driver interface
   (test-support/node-sqlite-driver.ts), not a hand-written fake, so the
   SQL these tests exercise is the SQL the browser runs. */

import { test, expect } from 'vitest';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { BOOT_KEYS, DISGUISED_PALETTE, PREFERENCE_DEFAULTS } from './catalogue.ts';
import { portablePreferences } from '../archive/payload.ts';
import { surfaceOn, withSurface } from '../../unprompted/registry.ts';
import {
  openPreferences,
  restorePortablePreferencesWithin,
  type BootPreferences,
  type PreferenceCache
} from './preferences.ts';

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
  expect(prefs.get('allowScreenCapture')).toBe(true);
  expect(prefs.openedEmpty()).toBe(true);
});

test('a saved capture block survives the new default', async () => {
  const driver = await migratedDb();
  const prefs = await openPreferences(driver);
  await prefs.set('allowScreenCapture', false);

  const reopened = await openPreferences(driver);
  expect(reopened.get('allowScreenCapture')).toBe(false);
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

test('a newly added flag palette survives reopening', async () => {
  const driver = await migratedDb();
  const prefs = await openPreferences(driver);
  await prefs.set('palette', 'polish');

  const reopened = await openPreferences(driver);
  expect(reopened.get('palette')).toBe('polish');
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
  await written.set('backupNoticeDismissed', true);
  await written.set('a11yTextSizeBoost', true);
  await written.set('a11yLegibilityBoost', true);
  await written.set('a11yMotionReduce', true);
  await written.set('allowScreenCapture', true);
  await written.set('preferredLabUnits', { estradiol: 'pmol/L', testosterone: 'nmol/L' });

  const reread = await openPreferences(driver);

  expect(reread.get('disguise')).toBe(true);
  expect(reread.get('metricDimension')).toBe('g-voice');
  expect(reread.get('metricKind')).toBe('dimension');
  expect(reread.get('lastBackupAt')).toBe(null);
  expect(reread.get('backupNoticeDismissed')).toBe(true);
  expect(reread.get('a11yTextSizeBoost')).toBe(true);
  expect(reread.get('a11yLegibilityBoost')).toBe(true);
  expect(reread.get('a11yMotionReduce')).toBe(true);
  expect(reread.get('allowScreenCapture')).toBe(true);
  expect(reread.get('preferredLabUnits')).toEqual({ estradiol: 'pmol/L', testosterone: 'nmol/L' });
});

test('SQLite wins over the cache, because the cache is only a cache', async () => {
  const driver = await migratedDb();
  const seeded = await openPreferences(driver);
  await seeded.set('palette', 'nonbinary');

  const { cache } = recordingCache();
  cache.write({
    theme: 'system',
    palette: 'stale-from-a-past-session',
    moodPreset: 'teal',
    language: 'system',
    a11yTextSizeBoost: false,
    a11yLegibilityBoost: false,
    a11yMotionReduce: false,
    lockAfter: 'restart',
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

test('publishing an atomic restore snapshot refreshes cached values and the boot mirror without SQL', async () => {
  const driver = await migratedDb();
  const { cache, current } = recordingCache();
  try {
    const preferences = await openPreferences(driver, cache);
    await preferences.set('name', 'Original synthetic name');
    await preferences.set('language', 'en');
    await driver.transaction(async (within) => {
      await within.run('UPDATE pref SET value = ? WHERE key = ?', ['"Incoming synthetic name"', 'name']);
      await within.run('UPDATE pref SET value = ? WHERE key = ?', ['"pl"', 'language']);
    });
    const before = await driver.query('SELECT key, value FROM pref ORDER BY key');
    const snapshot = (await openPreferences(driver)).all();
    const publish = preferences.prepareCommittedValues(snapshot);
    const query = driver.query;
    driver.query = async () => { throw new Error('synthetic post-commit read refusal'); };
    publish();
    driver.query = query;
    expect(preferences.get('name')).toBe('Incoming synthetic name');
    expect(preferences.get('language')).toBe('pl');
    expect(current().language).toBe('pl');
    expect(await driver.query('SELECT key, value FROM pref ORDER BY key')).toEqual(before);
  } finally { await driver.close(); }
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

/* Lock timing replaced the lock-on-leave switch, and version 117 moved the old row across
   in SQL. Reading it here is gone: a stray row from a build that never migrated is simply
   skipped. */
test('a stray lock on leave row is skipped, like any key this build does not know', async () => {
  const driver = await migratedDb();
  await driver.run('INSERT INTO pref (key, value) VALUES (?, ?)', ['lockOnLeave', 'true']);

  const prefs = await openPreferences(driver);

  expect(prefs.get('lockAfter')).toBe('restart');
});

test('a timing chosen by the person is read back', async () => {
  const driver = await migratedDb();
  const first = await openPreferences(driver);
  await first.set('lockAfter', 'five-minutes');

  const reopened = await openPreferences(driver);

  expect(reopened.get('lockAfter')).toBe('five-minutes');
});

/* A tile switch is portable, so one set before an export is set after restoring that
   archive into a fresh journal. */
test('a tile switch set before an export is set after restoring it into a fresh journal', async () => {
  const source = await openPreferences(await migratedDb());
  await source.set('surfaceOverrides', withSurface(source.get('surfaceOverrides'), 'wear-timer', false));
  const archived = JSON.parse(JSON.stringify(portablePreferences(source.all())));

  const freshDriver = await migratedDb();
  expect(surfaceOn((await openPreferences(freshDriver)).get('surfaceOverrides'), 'wear-timer')).toBe(true);
  await restorePortablePreferencesWithin(freshDriver, archived);

  const restored = await openPreferences(freshDriver);
  expect(surfaceOn(restored.get('surfaceOverrides'), 'wear-timer')).toBe(false);
  expect(surfaceOn(restored.get('surfaceOverrides'), 'dose-panel')).toBe(true);
});

test('a successful later write wins over prepared Archive values, including reasserting the old value', async () => {
  const driver = await migratedDb();
  const { cache, current } = recordingCache();
  try {
    const preferences = await openPreferences(driver, cache);
    await preferences.set('language', 'en');
    const publish = preferences.prepareCommittedValues({ ...preferences.all(), language: 'pl', name: 'Incoming synthetic name' });
    await preferences.set('language', 'en');
    publish();
    expect(preferences.get('language')).toBe('en');
    expect(current().language).toBe('en');
    expect(preferences.get('name')).toBe('Incoming synthetic name');
  } finally { await driver.close(); }
});

test('a backup failure receipt and quiet-hours hold survive reopening SQLite', async () => {
  const driver = await migratedDb();
  const first = await openPreferences(driver);
  await first.set('heldExportFailureNotice', true);
  await first.set('lastExportFailureNotifiedAt', 1_760_000_000_000);

  const second = await openPreferences(driver);
  expect(second.get('lastExportFailureNotifiedAt')).toBe(1_760_000_000_000);
  expect(second.get('heldExportFailureNotice')).toBe(true);
});

const LETTER = '0b2f6c1e-5d3a-4f7e-9a10-1c2d3e4f5a6b';
const ACKNOWLEDGED = {
  snoozes: { 'ready-letter': 1_800_000_000_000 },
  readLetterIds: [LETTER],
  greetedLetterIds: [],
  hasEntries: true
};

test('the boot mirror names the neutral palette while disguised, and the real one otherwise', async () => {
  const driver = await migratedDb();
  const { cache, current } = recordingCache();
  try {
    const preferences = await openPreferences(driver, cache);
    await preferences.set('palette', 'lesbian');
    expect(current().palette).toBe('lesbian');

    await preferences.set('disguise', true);
    expect(current().palette).toBe(DISGUISED_PALETTE);
    expect(current().disguise).toBe(true);
    expect(preferences.get('palette')).toBe('lesbian');

    await preferences.set('palette', 'rainbow');
    expect(current().palette).toBe(DISGUISED_PALETTE);

    await preferences.set('disguise', false);
    expect(current().palette).toBe('rainbow');
  } finally { await driver.close(); }
});

test('a reopen while disguised writes the neutral palette too', async () => {
  const driver = await migratedDb();
  try {
    const first = await openPreferences(driver);
    await first.set('palette', 'pansexual');
    await first.set('disguise', true);
    const { cache, writes } = recordingCache();
    await openPreferences(driver, cache);
    expect(writes.map((boot) => boot.palette)).toEqual([DISGUISED_PALETTE]);
  } finally { await driver.close(); }
});

test('acknowledgements survive a restart', async () => {
  const driver = await migratedDb();
  try {
    await (await openPreferences(driver)).set('acknowledgements', ACKNOWLEDGED);
    expect((await openPreferences(driver)).get('acknowledgements')).toEqual(ACKNOWLEDGED);
  } finally { await driver.close(); }
});

test('acknowledgements travel in a backup and come back sanitised on restore', async () => {
  const source = await migratedDb();
  const target = await migratedDb();
  try {
    const sourcePrefs = await openPreferences(source);
    await sourcePrefs.set('acknowledgements', ACKNOWLEDGED);
    const archived = portablePreferences(sourcePrefs.all());
    expect(archived.acknowledgements).toEqual(ACKNOWLEDGED);

    const hostile = { ...archived, acknowledgements: { ...ACKNOWLEDGED, readLetterIds: [LETTER, 42, 'let-1'] } } as never;
    await restorePortablePreferencesWithin(target, hostile);
    expect((await openPreferences(target)).get('acknowledgements')).toEqual(ACKNOWLEDGED);
  } finally {
    await source.close();
    await target.close();
  }
});
