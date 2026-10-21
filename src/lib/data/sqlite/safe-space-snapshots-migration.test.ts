/* FA 09: counterevidence snapshots are cut. Version 96 drops both of their
   tables, rows and indexes included, from a journal that holds some. A cut
   removes rather than converts, so nothing is carried anywhere. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { runMigrations } from './migration-runner.ts';
import { migrations } from './migrations.ts';
import { noopFileOps } from './test-support/migrated-db.ts';
import { makeNodeSqliteDb } from './test-support/node-sqlite-driver.ts';

test('version 96 drops the counterevidence snapshot tables and their rows', async () => {
  const db = makeNodeSqliteDb();
  const fileOps = noopFileOps();
  await runMigrations(db, fileOps, migrations.filter((m) => m.version <= 94));
  db.raw.exec(`INSERT INTO doubt_snapshot (uuid, epoch_day, timestamp, updated_at) VALUES ('s1', 100, 1000, 1000)`);
  db.raw.exec(`INSERT INTO doubt_snapshot_entry (snapshot_id, order_index, epoch_day, mood, note)
               VALUES ((SELECT id FROM doubt_snapshot WHERE uuid = 's1'), 0, 99, 5, 'a good week')`);

  await runMigrations(db, fileOps, migrations);

  assert.ok((await db.getUserVersion()) >= 96);
  const left = db.raw
    .prepare("SELECT type, name FROM sqlite_master WHERE name LIKE '%doubt_snapshot%' ORDER BY name")
    .all();
  assert.deepEqual(left, []);
  assert.deepEqual(db.raw.prepare('PRAGMA foreign_key_check').all(), []);
  assert.deepEqual(db.raw.prepare('PRAGMA integrity_check').all().map((row) => ({ ...(row as object) })), [
    { integrity_check: 'ok' }
  ]);
});
