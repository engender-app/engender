import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { fakeFileStore } from '../photos/test-support/fake-file-store';
import { migratedDb, noopFileOps } from '../sqlite/test-support/migrated-db';
import { makeNodeSqliteDb } from '../sqlite/test-support/node-sqlite-driver';
import { openPreferences } from '../prefs/preferences';
import { InterruptedRestoreError, SchemaTooNewError } from '../sqlite/migration-runner';
import { LATEST_SCHEMA_VERSION } from '../sqlite/schema-version';
import { openJournal } from '../journal/journal';
import { persona } from './persona';
import { preparePersonaJournal, seedPersonaInTransaction } from './worker-seed';
import { writePersonaJournal } from './journal-seed';

const photo = async () => ({ full: new Uint8Array([1, 2]), thumb: new Uint8Array([3]) });

function withoutRandomIdentity(value: unknown): unknown {
  const ids = new Map<string, string>();
  return JSON.parse(JSON.stringify(value).replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
    (id) => {
      if (!ids.has(id)) ids.set(id, `identity-${ids.size}`);
      return ids.get(id)!;
    }
  ));
}

test('one seed keeps the persona rows and dates relative to its anchor', async () => {
  vi.stubEnv('TZ', 'Europe/Warsaw');
  vi.spyOn(Date, 'now').mockReturnValue(1_791_115_200_000);
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);
  const baselineDb = await migratedDb();
  const baseline = openJournal(baselineDb, fakeFileStore());
  try {
    await journal.reconcileBuiltIns();
    await baseline.reconcileBuiltIns();
    await writePersonaJournal(baseline, persona(20_730), photo);
    await preparePersonaJournal(db, files, noopFileOps(), persona(20_730), photo);
    assert.deepEqual(
      withoutRandomIdentity((await journal.archive.snapshot()).journal),
      withoutRandomIdentity((await baseline.archive.snapshot()).journal)
    );
    assert.equal(await journal.entries.countAll(), 266);
    assert.equal((await journal.photos.inJournal()).length, 21);
    const first = (await journal.entries.entriesForDay(20_581))[0];
    assert.equal(first.note, 'Laser session #6. Stings, but the shadow is basically gone on my cheeks.');
    assert.equal(first.mood, 2);
    assert.equal(first.timestamp, 1_778_237_160_000);
    assert.equal((await journal.entries.entriesForDay(20_730))[0].timestamp, 1_791_104_400_000);
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await db.close();
    await baselineDb.close();
  }
});

test('a failed photo write rolls back every persona row', async () => {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);
  try {
    await journal.reconcileBuiltIns();
    files.failNthWrite(5);
    await assert.rejects(() => seedPersonaInTransaction(db, files, persona(20_730), photo), /disk full/);
    assert.equal(await journal.entries.countAll(), 0);
    assert.equal((await journal.photos.inJournal()).length, 0);
    assert.equal((await journal.presentations.getPresentations()).length, 0);
  } finally {
    await db.close();
  }
});

test('cold preparation migrates once, retains its copy and leaves preferences for the page', async () => {
  const db = makeNodeSqliteDb();
  const files = fakeFileStore();
  const copy = vi.fn();
  const cleanup = vi.fn();
  try {
    assert.equal(await preparePersonaJournal(db, files, {
      ...noopFileOps(), copyDatabaseFile: copy, cleanupPreMigrationCopy: cleanup
    }, persona(20_730), photo), true);
    assert.equal(await db.getUserVersion(), LATEST_SCHEMA_VERSION);
    assert.equal(copy.mock.calls.length, 1);
    assert.equal(cleanup.mock.calls.length, 0);
    const preferences = await openPreferences(db);
    assert.equal(preferences.openedEmpty(), true);
    assert.equal(await openJournal(db, files).entries.countAll(), 266);
    await preferences.set('name', 'Existing demo');
    await db.run('UPDATE entry SET note = ? WHERE id = 1', ['Edited demo note']);
    assert.equal(await preparePersonaJournal(db, files, noopFileOps(), persona(20_730), photo), false);
    assert.equal((await db.query<{ note: string }>('SELECT note FROM entry WHERE id = 1'))[0].note, 'Edited demo note');
    assert.equal((await openPreferences(db)).get('name'), 'Existing demo');
  } finally {
    await db.close();
  }
});

test('cold preparation refuses a newer schema before altering its rows', async () => {
  const db = await migratedDb();
  try {
    await db.setUserVersion(LATEST_SCHEMA_VERSION + 1);
    await assert.rejects(() => preparePersonaJournal(db, fakeFileStore(), noopFileOps(), persona(20_730), photo), SchemaTooNewError);
    assert.equal(await db.getUserVersion(), LATEST_SCHEMA_VERSION + 1);
  } finally {
    await db.close();
  }
});

test('a forged version zero cannot bypass clearing or overwrite authored rows', async () => {
  const db = await migratedDb();
  const copy = vi.fn();
  try {
    await openJournal(db, fakeFileStore()).entries.upsertEntry({
      epochDay: 20_730, timestamp: 1_791_104_400_000, mood: 2, note: 'Keep this authored note'
    });
    await db.setUserVersion(0);
    await assert.rejects(() => preparePersonaJournal(db, fakeFileStore(), {
      ...noopFileOps(), copyDatabaseFile: copy
    }, persona(20_730), photo), /table entry already exists/);
    assert.equal(await db.getUserVersion(), 0);
    assert.equal(copy.mock.calls.length, 1);
    assert.deepEqual((await db.query<{ note: string }>('SELECT note FROM entry')).map(({ note }) => note), ['Keep this authored note']);
  } finally {
    await db.close();
  }
});

test('an interrupted seed with empty preferences clears before retrying', async () => {
  const db = await migratedDb();
  const files = fakeFileStore();
  try {
    await preparePersonaJournal(db, files, noopFileOps(), persona(20_730), photo);
    await db.run('UPDATE entry SET note = ? WHERE id = 1', ['Interrupted demo note']);
    assert.equal((await openPreferences(db)).openedEmpty(), true);
    assert.equal(await preparePersonaJournal(db, files, noopFileOps(), persona(20_730), photo), true);
    assert.equal(await openJournal(db, files).entries.countAll(), 266);
    assert.equal((await openJournal(db, files).photos.inJournal()).length, 21);
    assert.deepEqual(await db.query('SELECT note FROM entry WHERE note = ?', ['Interrupted demo note']), []);
  } finally {
    await db.close();
  }
});

test('cold preparation preserves an interrupted restore instead of seeding an empty journal', async () => {
  const db = makeNodeSqliteDb();
  const copy = vi.fn();
  try {
    await assert.rejects(() => preparePersonaJournal(db, fakeFileStore(), {
      ...noopFileOps(), preMigrationCopyIsUsable: () => true, copyDatabaseFile: copy
    }, persona(20_730), photo), InterruptedRestoreError);
    assert.equal(await db.getUserVersion(), 0);
    assert.equal(copy.mock.calls.length, 0);
  } finally {
    await db.close();
  }
});

test('failed cold preparation retains migrated schema and leaves the persona and preferences empty', async () => {
  const db = makeNodeSqliteDb();
  const files = fakeFileStore();
  files.failNthWrite(5);
  try {
    await assert.rejects(() => preparePersonaJournal(db, files, noopFileOps(), persona(20_730), photo), /disk full/);
    assert.equal(await db.getUserVersion(), LATEST_SCHEMA_VERSION);
    assert.equal(await openJournal(db, files).entries.countAll(), 0);
    assert.equal((await openJournal(db, files).photos.inJournal()).length, 0);
    assert.equal((await openPreferences(db)).openedEmpty(), true);
  } finally {
    await db.close();
  }
});
