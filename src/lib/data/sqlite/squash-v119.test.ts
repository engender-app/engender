/* The post-rc.1 squash (pre-publish ticket 01): what the chain from the v88
   baseline up to 119 builds, held to dumps frozen from the unsquashed chain
   before the squash touched it. The headers of the four schema-v119-* files
   in test-support say which commit carried that chain and how to rebuild
   them. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JournalBelowBaselineError, runMigrations, type Migration } from './migration-runner.ts';
import { migrations } from './migrations.ts';
import { makeNodeSqliteDb } from './test-support/node-sqlite-driver.ts';
import { noopFileOps } from './test-support/noop-file-ops.ts';
import { preSquashChain } from './test-support/pre-squash-chain.ts';
import { RC1_CONVERSION_SEED } from './test-support/rc1-conversion-seed.ts';
import { dumpRows, dumpSchema, readSchemaFixture } from './test-support/schema-dump.ts';

/* The version the chain had reached when it was squashed. Hardcoded rather
   than read off LATEST_SCHEMA_VERSION, which moves on with any migration
   released after 1.0.0. */
const SQUASHED_VERSION = 119;

const fixture = (name: string) =>
  readSchemaFixture(readFileSync(new URL(`./test-support/${name}`, import.meta.url), 'utf8'));

const RC1_JOURNAL = new URL('../../../../fixtures/released/1.0.0-rc.1/journal.sqlite', import.meta.url).pathname;

/* Migrations released after the squash move the live schema on; the frozen
   comparisons stop at the squashed version. */
const upToSquash = (chain: Migration[]) => chain.filter((m) => m.version <= SQUASHED_VERSION);

/** A disposable copy of the rc.1 released journal (never the fixture
    itself), optionally seeded at schema 88, then migrated by `chain`. */
async function migratedRc1(chain: Migration[], seed = '') {
  const directory = mkdtempSync(join(tmpdir(), 'engender-squash-'));
  const path = join(directory, 'journal.sqlite');
  copyFileSync(RC1_JOURNAL, path);
  const db = makeNodeSqliteDb(path);
  assert.equal(db.getUserVersion(), 88);
  if (seed) db.raw.exec(seed);
  await runMigrations(db, noopFileOps(), chain);
  return {
    db,
    dispose: async () => {
      await db.close();
      rmSync(directory, { recursive: true, force: true });
    }
  };
}

test('an empty database reaches the frozen v119 schema and rows', async () => {
  const db = makeNodeSqliteDb();
  await runMigrations(db, noopFileOps(), upToSquash(migrations));

  assert.equal(db.getUserVersion(), SQUASHED_VERSION);
  assert.equal(dumpSchema(db.raw) + '\n', fixture('schema-v119-reference.txt'));
  assert.equal(dumpRows(db.raw) + '\n', fixture('schema-v119-reference-rows.txt'));
});

test('the rc.1 released journal reaches the frozen v119 schema and keeps the frozen rows', async () => {
  const { db, dispose } = await migratedRc1(upToSquash(migrations));
  try {
    assert.equal(db.getUserVersion(), SQUASHED_VERSION);
    assert.equal(dumpSchema(db.raw) + '\n', fixture('schema-v119-reference.txt'));
    assert.equal(dumpRows(db.raw) + '\n', fixture('schema-v119-rc1-rows.txt'));
    assert.deepEqual(await db.query('PRAGMA integrity_check'), [{ integrity_check: 'ok' }]);
    assert.deepEqual(await db.query('PRAGMA foreign_key_check'), []);
  } finally {
    await dispose();
  }
});

test('every data conversion gives the rows the unsquashed chain gave', async () => {
  const { db, dispose } = await migratedRc1(upToSquash(migrations), RC1_CONVERSION_SEED);
  try {
    assert.equal(db.getUserVersion(), SQUASHED_VERSION);
    assert.equal(dumpSchema(db.raw) + '\n', fixture('schema-v119-reference.txt'));
    assert.equal(dumpRows(db.raw) + '\n', fixture('schema-v119-rc1-seeded-rows.txt'));
    assert.deepEqual(await db.query('PRAGMA integrity_check'), [{ integrity_check: 'ok' }]);
    assert.deepEqual(await db.query('PRAGMA foreign_key_check'), []);
  } finally {
    await dispose();
  }
});

/** SQLite's schema cookie, which any DDL bumps even when it undoes itself. */
const schemaCookie = (db: { raw: { prepare(sql: string): { get(): unknown } } }) =>
  (db.raw.prepare('PRAGMA schema_version').get() as { schema_version: number }).schema_version;

test.each([89, 90, 118])(
  'a development journal at %i, built by the unsquashed chain, is refused before anything is written',
  async (version) => {
    /* Only development and test builds ever ran the steps between 88 and
       119 one at a time, so a journal at one of them has no step left to
       take: the squash starts from 88. It is refused by name, like a journal
       below the baseline, so the failure screen says where it came from and
       offers the archive way out (BootFailureNotice, 'below-baseline'). */
    const db = makeNodeSqliteDb();
    await runMigrations(db, noopFileOps(), preSquashChain.filter((m) => m.version <= version));
    db.raw.exec("INSERT INTO entry (uuid, epoch_day, timestamp, note, updated_at) VALUES ('e1', 100, 1000, 'still here', 1000)");
    const rows = dumpRows(db.raw);
    const schema = dumpSchema(db.raw);
    const cookie = schemaCookie(db);
    const calls = { copies: 0, cleanups: 0, restores: 0 };
    const fileOps = {
      preMigrationCopyIsUsable: () => true,
      copyDatabaseFile: () => { calls.copies += 1; },
      restorePreMigrationCopy: () => { calls.restores += 1; },
      cleanupPreMigrationCopy: () => { calls.cleanups += 1; }
    };

    await assert.rejects(
      () => runMigrations(db, fileOps, migrations),
      (error: unknown) =>
        error instanceof JournalBelowBaselineError &&
        error.name === 'JournalBetweenStepsError' &&
        error.foundVersion === version &&
        error.baselineVersion === 88
    );

    assert.deepEqual(calls, { copies: 0, cleanups: 0, restores: 0 });
    assert.equal(db.getUserVersion(), version);
    assert.equal(dumpRows(db.raw), rows);
    assert.equal(dumpSchema(db.raw), schema);
    assert.equal(schemaCookie(db), cookie);
  }
);

test('a process killed inside the step leaves the rc.1 journal at 88 with its rows', async () => {
  /* What a kill leaves is whatever is on disk at that moment: the journal
     file and its rollback journal. Both are copied from inside the last
     data step, after every other part of the squash has run, and the copy
     is opened the way the next boot would open it. SQLite rolls the hot
     journal back, so the copy must read as the untouched rc.1 journal, not
     as anything between 88 and 119. */
  const directory = mkdtempSync(join(tmpdir(), 'engender-squash-kill-'));
  const live = join(directory, 'journal.sqlite');
  const killed = join(directory, 'killed.sqlite');
  copyFileSync(RC1_JOURNAL, live);
  const original = makeNodeSqliteDb(RC1_JOURNAL);
  const rowsAt88 = dumpRows(original.raw);
  const schemaAt88 = dumpSchema(original.raw);
  await original.close();

  const last = Math.max(...upToSquash(migrations).map((m) => m.version));
  const snapshotInside = upToSquash(migrations).map((m) => m.version !== last ? m : {
    ...m,
    apply: async (db: Parameters<NonNullable<Migration['apply']>>[0]) => {
      await m.apply?.(db);
      copyFileSync(live, killed);
      if (existsSync(`${live}-journal`)) copyFileSync(`${live}-journal`, `${killed}-journal`);
    }
  });
  const db = makeNodeSqliteDb(live);
  try {
    await runMigrations(db, noopFileOps(), snapshotInside);
    assert.equal(db.getUserVersion(), SQUASHED_VERSION);
  } finally {
    await db.close();
  }

  const reopened = makeNodeSqliteDb(killed);
  try {
    assert.equal(reopened.getUserVersion(), 88);
    assert.equal(dumpSchema(reopened.raw), schemaAt88);
    assert.equal(dumpRows(reopened.raw), rowsAt88);
    assert.deepEqual(await reopened.query('PRAGMA integrity_check'), [{ integrity_check: 'ok' }]);
  } finally {
    await reopened.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
