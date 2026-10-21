/* Functional audit ticket 08: version 104 rebuilds reminder without its type
   column and without WEEKLY, keeping every row, its id and the id counter. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { runMigrations } from './migration-runner.ts';
import { migrations } from './migrations.ts';
import { noopFileOps } from './test-support/migrated-db.ts';
import { makeNodeSqliteDb } from './test-support/node-sqlite-driver.ts';

test('version 104 drops the reminder type and keeps every row, id and the id counter', async () => {
  const db = makeNodeSqliteDb();
  const fileOps = noopFileOps();
  await runMigrations(db, fileOps, migrations.filter((m) => m.version <= 103));
  db.raw.exec(`INSERT INTO reminder (uuid, title, type, time, recurrence, enabled, updated_at, auto_source)
               VALUES ('r1', 'Pill', 'med', '20:00', 'DAILY', 1, 1000, 'stock:e'),
                      ('gone', 'x', 'other', '20:00', 'DAILY', 1, 1000, NULL)`);
  db.raw.exec(`INSERT INTO reminder (uuid, title, type, time, epoch_day, enabled, updated_at)
               VALUES ('r2', 'Visit', 'appointment', '09:00', 100, 0, 1000)`);
  db.raw.exec(`DELETE FROM reminder WHERE uuid = 'gone'`);
  const before = db.raw.prepare('SELECT id, uuid FROM reminder ORDER BY id').all();
  const seq = () => (db.raw.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'reminder'").get() as { seq: number }).seq;
  const seqBefore = seq();

  await runMigrations(db, fileOps, migrations);

  const columns = (db.raw.prepare('PRAGMA table_info(reminder)').all() as Array<{ name: string }>).map((c) => c.name);
  assert.ok(!columns.includes('type'));
  assert.deepEqual(db.raw.prepare('SELECT id, uuid FROM reminder ORDER BY id').all(), before);
  assert.equal(seq(), seqBefore);
  assert.deepEqual(
    { ...(db.raw.prepare("SELECT title, time, recurrence, enabled, auto_source FROM reminder WHERE uuid = 'r1'").get() as object) },
    { title: 'Pill', time: '20:00', recurrence: 'DAILY', enabled: 1, auto_source: 'stock:e' }
  );
  assert.deepEqual(
    { ...(db.raw.prepare("SELECT recurrence, epoch_day, enabled FROM reminder WHERE uuid = 'r2'").get() as object) },
    { recurrence: null, epoch_day: 100, enabled: 0 }
  );
  assert.deepEqual({ ...(db.raw.prepare('PRAGMA integrity_check').get() as object) }, { integrity_check: 'ok' });
});
