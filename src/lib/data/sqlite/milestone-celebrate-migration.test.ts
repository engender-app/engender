/* Functional audit ticket 32: version 98 gives every milestone a
   "celebrate" flag, on for the milestones a journal already holds, and
   drops the felt-sense readings that hung off a milestone. A cut removes
   rather than converts, so a tryout's readings are all that is left. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { runMigrations } from './migration-runner.ts';
import { migrations } from './migrations.ts';
import { noopFileOps } from './test-support/migrated-db.ts';
import { makeNodeSqliteDb } from './test-support/node-sqlite-driver.ts';

async function journalAt97() {
  const db = makeNodeSqliteDb();
  const fileOps = noopFileOps();
  await runMigrations(db, fileOps, migrations.filter((m) => m.version <= 97));
  db.raw.exec(`INSERT INTO milestone (uuid, name, epoch_day, updated_at) VALUES ('m1', 'Started HRT', 100, 1000)`);
  return { db, fileOps };
}

test('version 98 keeps every existing milestone celebrated', async () => {
  const { db, fileOps } = await journalAt97();

  await runMigrations(db, fileOps, migrations);

  assert.ok((await db.getUserVersion()) >= 98);
  assert.deepEqual(
    db.raw.prepare('SELECT uuid, celebrate FROM milestone').all().map((row) => ({ ...(row as object) })),
    [{ uuid: 'm1', celebrate: 1 }]
  );
  assert.deepEqual(db.raw.prepare('PRAGMA foreign_key_check').all(), []);
  assert.deepEqual(db.raw.prepare('PRAGMA integrity_check').all().map((row) => ({ ...(row as object) })), [
    { integrity_check: 'ok' }
  ]);
});
