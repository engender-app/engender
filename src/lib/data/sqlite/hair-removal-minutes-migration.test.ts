/* FA 28: version 107 adds hair_removal_session.minutes. Rows from before it
   keep every column and read minutes as none. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { runMigrations } from './migration-runner.ts';
import { migrations } from './migrations.ts';
import { noopFileOps } from './test-support/migrated-db.ts';
import { makeNodeSqliteDb } from './test-support/node-sqlite-driver.ts';

test('version 107 adds minutes and leaves existing sessions untouched', async () => {
  const db = makeNodeSqliteDb();
  const fileOps = noopFileOps();
  await runMigrations(db, fileOps, migrations.filter((m) => m.version <= 106));
  db.raw
    .prepare(
      "INSERT INTO hair_removal_session (uuid, epoch_day, area, method, pain_rating, cost, provider, updated_at) VALUES ('s1', 100, 'chin', 'laser', 3, '200 PLN', 'Clinic', 1000)"
    )
    .run();

  await runMigrations(db, fileOps, migrations.filter((m) => m.version <= 107));

  assert.ok((await db.getUserVersion()) >= 107);
  const row = db.raw.prepare('SELECT * FROM hair_removal_session').get() as Record<string, unknown>;
  assert.equal(row.minutes, null);
  assert.deepEqual(
    [row.uuid, row.epoch_day, row.area, row.method, row.pain_rating, row.cost, row.provider],
    ['s1', 100, 'chin', 'laser', 3, '200 PLN', 'Clinic']
  );
  assert.deepEqual(db.raw.prepare('PRAGMA integrity_check').all().map((r) => ({ ...(r as object) })), [
    { integrity_check: 'ok' }
  ]);
});
