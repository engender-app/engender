import { expect, test } from 'vitest';
import { fakeFileStore } from '../photos/test-support/fake-file-store';
import { migratedDb } from '../sqlite/test-support/migrated-db';
import { openPreferences } from '../prefs/preferences';
import { openJournal } from './journal';
import type { SqliteDriver } from '../sqlite/driver';

async function fixture() {
  const sourceDriver = await migratedDb();
  const targetDriver = await migratedDb();
  const source = openJournal(sourceDriver, fakeFileStore());
  const target = openJournal(targetDriver, fakeFileStore());
  await source.reconcileBuiltIns();
  await target.reconcileBuiltIns();
  await source.entries.upsertEntry({ epochDay: 20000, mood: 4, note: 'Incoming synthetic entry' });
  await target.entries.upsertEntry({ epochDay: 19999, mood: 2, note: 'Original synthetic entry' });
  const preferences = await openPreferences(targetDriver);
  await preferences.set('name', 'Original synthetic name');
  await preferences.set('language', 'en');
  await preferences.set('lockAfter', 'immediately');
  const contents = {
    journal: (await source.archive.snapshot()).journal,
    preferences: { name: 'Incoming synthetic name', language: 'pl' as const },
    files: (async function* () {})()
  };
  return { target, targetDriver, sourceDriver, contents };
}

test('Replace commits portable preferences with the incoming rows and preserves device-local settings', async () => {
  const { target, targetDriver, sourceDriver, contents } = await fixture();
  try {
    await target.archive.replace(contents);
    const saved = await openPreferences(targetDriver);
    expect((await target.archive.snapshot()).journal.entries.map((row) => row.note)).toEqual(['Incoming synthetic entry']);
    expect(saved.get('name')).toBe('Incoming synthetic name');
    expect(saved.get('language')).toBe('pl');
    expect(saved.get('lockAfter')).toBe('immediately');
  } finally { await sourceDriver.close(); await targetDriver.close(); }
});

test('a refused portable preference rolls Replace rows and earlier preference writes back together', async () => {
  const { target, targetDriver, sourceDriver, contents } = await fixture();
  try {
    const before = await targetDriver.query('SELECT key, value FROM pref ORDER BY key');
    await targetDriver.exec(`CREATE TRIGGER refuse_restored_language BEFORE INSERT ON pref
      WHEN NEW.key = 'language' BEGIN SELECT RAISE(ABORT, 'synthetic preference refusal'); END`);
    await expect(target.archive.replace(contents)).rejects.toThrow('synthetic preference refusal');
    expect((await target.archive.snapshot()).journal.entries.map((row) => row.note)).toEqual(['Original synthetic entry']);
    expect(await targetDriver.query('SELECT key, value FROM pref ORDER BY key')).toEqual(before);
  } finally { await sourceDriver.close(); await targetDriver.close(); }
});

test('Merge retains destination preferences even when contents carries incoming preferences', async () => {
  const { target, targetDriver, sourceDriver, contents } = await fixture();
  try {
    const before = await targetDriver.query('SELECT key, value FROM pref ORDER BY key');
    await target.archive.merge(contents);
    expect((await target.archive.snapshot()).journal.entries).toHaveLength(2);
    expect(await targetDriver.query('SELECT key, value FROM pref ORDER BY key')).toEqual(before);
  } finally { await sourceDriver.close(); await targetDriver.close(); }
});


test('refusing the authoritative preference snapshot rolls rows and preferences back before COMMIT', async () => {
  const { targetDriver, sourceDriver, contents } = await fixture();
  const query = targetDriver.query.bind(targetDriver);
  const rejecting: SqliteDriver = {
    ...targetDriver,
    transaction: <T>(work: (driver: SqliteDriver) => T | Promise<T>) => targetDriver.transaction(async (within) => work({
      ...within,
      query: async <Row extends Record<string, unknown>>(sql: string, params?: unknown[]) => {
        if (sql === 'SELECT key, value FROM pref') throw new Error('synthetic prepared read refusal');
        return within.query<Row>(sql, params);
      }
    }))
  };
  const target = openJournal(rejecting, fakeFileStore());
  try {
    const before = await query('SELECT key, value FROM pref ORDER BY key');
    await expect(target.archive.replace(contents)).rejects.toThrow('synthetic prepared read refusal');
    expect((await target.archive.snapshot()).journal.entries[0].note).toBe('Original synthetic entry');
    expect(await query('SELECT key, value FROM pref ORDER BY key')).toEqual(before);
  } finally { await sourceDriver.close(); await targetDriver.close(); }
});
