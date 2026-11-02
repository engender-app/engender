/* The post-rc.1 squash (pre-publish ticket 01): what the chain from the v88
   baseline up to 119 builds, held to dumps frozen from the unsquashed chain
   before the squash touched it. The headers of the four schema-v119-* files
   in test-support say which commit carried that chain and how to rebuild
   them. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMigrations, type Migration } from './migration-runner.ts';
import { migrations } from './migrations.ts';
import { makeNodeSqliteDb } from './test-support/node-sqlite-driver.ts';
import { noopFileOps } from './test-support/noop-file-ops.ts';
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
