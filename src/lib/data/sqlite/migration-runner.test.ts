/* Unit tests for the migration runner (ADR-0006). Part of the Node tier
   (ticket 03); run with `npm test`. No production SQLite driver exists yet
   (ticket 04); node:sqlite's DatabaseSync stands in as a real, synchronous
   MigrationDb for these tests only. The fake file-ops object stands in for
   ticket 04's OPFS/Capacitor file copy. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  runMigrations,
  SchemaTooNewError,
  Fts5UnavailableError,
  InterruptedRestoreError,
  assertFts5Available
} from './migration-runner.ts';
import type { MigrationDb, MigrationFileOps, Migration } from './migration-runner.ts';
import { makeNodeSqliteDb as makeDb } from './test-support/node-sqlite-driver.ts';

// Stands in for a SQLite build without FTS5 compiled in - no node:sqlite
// build available to reproduce that, so the probe statement is faked.
// getUserVersion throws too, so a test can prove FTS5 is checked before
// anything else touches the database.
/** One step, enough for the runner to have something pending. */
const migrationsFixture: Migration[] = [{ version: 1, sql: 'CREATE TABLE widget (id INTEGER PRIMARY KEY);' }];

function makeFts5UnavailableDb(): MigrationDb {
  return {
    exec() {
      throw new Error('no such module: fts5');
    },
    getUserVersion() {
      throw new Error('getUserVersion should not be called when FTS5 is unavailable');
    },
    setUserVersion() {},
    transaction(fn) {
      return fn();
    }
  };
}

function makeFileOpsSpy(
  options: { copyExists?: boolean } = {}
): MigrationFileOps & { copyCalls: number; cleanupCalls: number } {
  return {
    copyCalls: 0,
    cleanupCalls: 0,
    preMigrationCopyIsUsable() {
      return options.copyExists ?? false;
    },
    copyDatabaseFile() {
      this.copyCalls++;
    },
    restorePreMigrationCopy() {
      throw new Error('runMigrations must never restore by itself; a person decides that');
    },
    cleanupPreMigrationCopy() {
      this.cleanupCalls++;
    }
  };
}

test('applies a single pending migration and records its version', async () => {
  const db = makeDb();
  const fileOps = makeFileOpsSpy();
  const migrations: Migration[] = [{ version: 1, sql: 'CREATE TABLE widget (id INTEGER PRIMARY KEY);' }];

  await runMigrations(db, fileOps, migrations);

  assert.equal(db.getUserVersion(), 1);
  const tables = db.raw
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'widget'")
    .all();
  assert.equal(tables.length, 1);
});

test('a step that throws leaves the database at the prior version with no partial changes', async () => {
  const db = makeDb();
  const fileOps = makeFileOpsSpy();
  const migrations: Migration[] = [
    {
      version: 1,
      // The second statement fails (duplicate table), so the whole step
      // must roll back - table `a` must not survive either.
      sql: 'CREATE TABLE a (id INTEGER PRIMARY KEY); CREATE TABLE a (id INTEGER PRIMARY KEY);'
    }
  ];

  await assert.rejects(() => runMigrations(db, fileOps, migrations));

  assert.equal(db.getUserVersion(), 0);
  const tables = db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'a'").all();
  assert.equal(tables.length, 0);
});

test('a later step failing does not touch an already-committed earlier step', async () => {
  const db = makeDb();
  const fileOps = makeFileOpsSpy();
  const migrations: Migration[] = [
    { version: 1, sql: 'CREATE TABLE widget (id INTEGER PRIMARY KEY);' },
    { version: 2, sql: 'this is not valid sql;' }
  ];

  await assert.rejects(() => runMigrations(db, fileOps, migrations));

  assert.equal(db.getUserVersion(), 1);
  const tables = db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'widget'").all();
  assert.equal(tables.length, 1);
});

test('refuses to open a database whose user_version is newer than the code knows', async () => {
  const db = makeDb();
  const fileOps = makeFileOpsSpy();
  db.raw.exec('PRAGMA user_version = 5');
  const migrations: Migration[] = [{ version: 1, sql: 'CREATE TABLE widget (id INTEGER PRIMARY KEY);' }];

  await assert.rejects(() => runMigrations(db, fileOps, migrations), SchemaTooNewError);
  // Refusing to open must not touch the file-copy hooks either.
  assert.equal(fileOps.copyCalls, 0);
});

test('copies the database file exactly once before the first pending step runs', async () => {
  const db = makeDb();
  const fileOps = makeFileOpsSpy();
  const migrations: Migration[] = [
    { version: 1, sql: 'CREATE TABLE widget (id INTEGER PRIMARY KEY);' },
    { version: 2, sql: 'ALTER TABLE widget ADD COLUMN label TEXT;' }
  ];

  await runMigrations(db, fileOps, migrations);

  assert.equal(fileOps.copyCalls, 1);
});

test('does not copy the database file when there is nothing pending', async () => {
  const db = makeDb();
  const fileOps = makeFileOpsSpy();
  db.raw.exec('PRAGMA user_version = 1');
  const migrations: Migration[] = [{ version: 1, sql: 'CREATE TABLE widget (id INTEGER PRIMARY KEY);' }];

  await runMigrations(db, fileOps, migrations);

  assert.equal(fileOps.copyCalls, 0);
});

test('does not clean up the pre-migration copy in the same boot that ran migrations', async () => {
  const db = makeDb();
  const fileOps = makeFileOpsSpy();
  const migrations: Migration[] = [{ version: 1, sql: 'CREATE TABLE widget (id INTEGER PRIMARY KEY);' }];

  await runMigrations(db, fileOps, migrations);

  assert.equal(fileOps.cleanupCalls, 0);
});

test('cleans up a leftover pre-migration copy on the next clean boot', async () => {
  const db = makeDb();
  const fileOps = makeFileOpsSpy();
  db.raw.exec('PRAGMA user_version = 1');
  const migrations: Migration[] = [{ version: 1, sql: 'CREATE TABLE widget (id INTEGER PRIMARY KEY);' }];

  await runMigrations(db, fileOps, migrations);

  assert.equal(fileOps.cleanupCalls, 1);
});

test('applies out-of-order pending migrations in ascending version order', async () => {
  const db = makeDb();
  const fileOps = makeFileOpsSpy();
  // Listed out of order on purpose: v2's ALTER TABLE only succeeds if v1 ran first.
  const migrations: Migration[] = [
    { version: 2, sql: 'ALTER TABLE widget ADD COLUMN label TEXT;' },
    { version: 1, sql: 'CREATE TABLE widget (id INTEGER PRIMARY KEY);' }
  ];

  await runMigrations(db, fileOps, migrations);

  assert.equal(db.getUserVersion(), 2);
  const columns = db.raw.prepare('PRAGMA table_info(widget)').all() as Array<{ name: string }>;
  assert.deepEqual(
    columns.map((c) => c.name),
    ['id', 'label']
  );
});

test('a copy left by a failed migration is not written over by the retry', async () => {
  /* Ticket 04. The retry's copy would be taken from a database the failed
     attempt has already been at, and if the file is damaged the copy cannot
     be written at all - so overwriting spends the one recovery point to make
     a worse one, or destroys it and makes none. ADR-0006 keeps the copy until
     a boot comes up clean; a boot that finds migrations pending is not one. */
  const db = makeDb();
  const fileOps = makeFileOpsSpy({ copyExists: true });
  /* At v1 with v2 pending, which is what a retry after a failed later step
     looks like. Not at v0, which beside a readable copy is the interrupted
     restore further down rather than a retry. */
  db.raw.exec('CREATE TABLE widget (id INTEGER PRIMARY KEY); PRAGMA user_version = 1');
  const migrations: Migration[] = [
    { version: 1, sql: 'CREATE TABLE widget (id INTEGER PRIMARY KEY);' },
    { version: 2, sql: 'ALTER TABLE widget ADD COLUMN label TEXT;' }
  ];

  await runMigrations(db, fileOps, migrations);

  assert.equal(fileOps.copyCalls, 0);
  assert.equal(db.getUserVersion(), 2, 'and the migration still runs: the copy it needed is already there');
});

test('a copy is still made when the pending migration is the first attempt', async () => {
  const db = makeDb();
  const fileOps = makeFileOpsSpy({ copyExists: false });
  const migrations: Migration[] = [{ version: 1, sql: 'CREATE TABLE widget (id INTEGER PRIMARY KEY);' }];

  await runMigrations(db, fileOps, migrations);

  assert.equal(fileOps.copyCalls, 1);
});

test('a failed migration leaves the copy where it is', async () => {
  const db = makeDb();
  const fileOps = makeFileOpsSpy();
  const migrations: Migration[] = [
    { version: 1, sql: 'CREATE TABLE widget (id INTEGER PRIMARY KEY);' },
    { version: 2, sql: 'this is not valid sql;' }
  ];

  await assert.rejects(() => runMigrations(db, fileOps, migrations));

  assert.equal(fileOps.copyCalls, 1);
  assert.equal(fileOps.cleanupCalls, 0, 'the copy is the only way back to the previous journal');
});

test('refuses an empty database while a pre-migration copy is sitting next to it', async () => {
  /* The window inside restorePreMigrationCopy (mc-worker.ts): the live
     database is unlinked and the copy is being written over it. A process
     killed there leaves a fresh empty file with a copy beside it - and
     without this refusal, every migration applies cleanly to the empty file,
     the app reaches its journal screen holding nothing, and the boot after
     that comes up clean and deletes the copy. Silent total loss, of exactly
     the journal ADR-0006's copy exists to insure.

     An empty database with a copy beside it cannot arise any other way: a
     copy is only ever written from a database that had a schema. */
  const db = makeDb();
  const fileOps = makeFileOpsSpy({ copyExists: true });

  await assert.rejects(() => runMigrations(db, fileOps, migrationsFixture), InterruptedRestoreError);

  assert.equal(db.getUserVersion(), 0, 'and nothing was applied to the empty file');
  assert.equal(fileOps.copyCalls, 0, 'nor was the copy replaced by one taken from it');
});

test('a first run with no copy beside it is not mistaken for an interrupted restore', async () => {
  const db = makeDb();
  const fileOps = makeFileOpsSpy({ copyExists: false });

  await runMigrations(db, fileOps, migrationsFixture);

  assert.equal(db.getUserVersion(), 1);
});

test('assertFts5Available resolves against a build that has FTS5 compiled in', async () => {
  const db = makeDb();
  await assert.doesNotReject(() => assertFts5Available(db));
});

test('assertFts5Available fails loudly with a distinct error when FTS5 is missing', async () => {
  await assert.rejects(() => assertFts5Available(makeFts5UnavailableDb()), Fts5UnavailableError);
});

test('runMigrations fails loudly on missing FTS5 before touching versions or file-copy hooks', async () => {
  const fileOps = makeFileOpsSpy();
  const db = makeFts5UnavailableDb();
  const migrations: Migration[] = [{ version: 1, sql: 'CREATE TABLE widget (id INTEGER PRIMARY KEY);' }];

  await assert.rejects(() => runMigrations(db, fileOps, migrations), Fts5UnavailableError);
  assert.equal(fileOps.copyCalls, 0);
});
