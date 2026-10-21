/* FA 12: the Words reading is cut. Version 103 drops the list of words it was
   told to skip, rows and the UNIQUE index on the word included. A cut removes
   rather than converts, so nothing is carried anywhere. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { runMigrations } from './migration-runner.ts';
import { migrations } from './migrations.ts';
import { noopFileOps } from './test-support/migrated-db.ts';
import { makeNodeSqliteDb } from './test-support/node-sqlite-driver.ts';

test('version 103 drops the word ignore list and its rows', async () => {
  const db = makeNodeSqliteDb();
  const fileOps = noopFileOps();
  await runMigrations(db, fileOps, migrations.filter((m) => m.version <= 102));
  db.raw.exec(`INSERT INTO word_frequency_ignore (word, updated_at) VALUES ('voice', 1000)`);

  await runMigrations(db, fileOps, migrations);

  assert.ok((await db.getUserVersion()) >= 103);
  const left = db.raw
    .prepare("SELECT type, name FROM sqlite_master WHERE name LIKE '%word_frequency_ignore%' ORDER BY name")
    .all();
  assert.deepEqual(left, []);
  assert.deepEqual(db.raw.prepare('PRAGMA integrity_check').all().map((row) => ({ ...(row as object) })), [
    { integrity_check: 'ok' }
  ]);
});
