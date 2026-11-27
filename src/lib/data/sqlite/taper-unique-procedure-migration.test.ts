/* one taper per procedure. The app reads the taper as one row, but nothing in the schema
   said so, and a merge or a stray write could leave a procedure with two. Version 112 keeps
   the newest taper of each procedure and puts a UNIQUE index on `taper.procedure_id`. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { runMigrations } from './migration-runner.ts';
import { migrations } from './migrations.ts';
import { migratedDb, noopFileOps } from './test-support/migrated-db.ts';
import { makeNodeSqliteDb } from './test-support/node-sqlite-driver.ts';

const procedure = (uuid: string) =>
  `INSERT INTO procedure (uuid, name, notes, surgery_epoch_day, updated_at) VALUES ('${uuid}', '${uuid}', '', 100, 1)`;
const taper = (uuid: string, procedureUuid: string, updatedAt: number) =>
  `INSERT INTO taper (uuid, procedure_id, start_epoch_day, stages, updated_at)
   VALUES ('${uuid}', (SELECT id FROM procedure WHERE uuid = '${procedureUuid}'), 105, '[]', ${updatedAt})`;

test('a second taper for the same procedure is refused, and a taper for another one is not', async () => {
  const db = await migratedDb();
  db.raw.exec(procedure('p1'));
  db.raw.exec(procedure('p2'));
  db.raw.exec(taper('t1', 'p1', 1));
  assert.throws(() => db.raw.exec(taper('t2', 'p1', 2)), /UNIQUE constraint failed: taper\.procedure_id/);
  assert.doesNotThrow(() => db.raw.exec(taper('t3', 'p2', 3)));
});

test('migrating a 111 with two tapers on one procedure keeps the newest, and leaves the rest alone', async () => {
  const db = makeNodeSqliteDb();
  const fileOps = noopFileOps();
  await runMigrations(db, fileOps, migrations.filter((m) => m.version <= 111));
  db.raw.exec(procedure('p1'));
  db.raw.exec(procedure('p2'));
  // Inserted out of age order, so neither the rowid nor insertion order is
  // what picks the survivor; a tie on updated_at keeps the later row.
  db.raw.exec(taper('newest', 'p1', 3000));
  db.raw.exec(taper('oldest', 'p1', 1000));
  db.raw.exec(taper('tied-first', 'p2', 2000));
  db.raw.exec(taper('tied-second', 'p2', 2000));
  db.raw.exec(`INSERT INTO taper_session (uuid, epoch_day, note, updated_at) VALUES ('s1', 106, 'kept', 1)`);

  await runMigrations(db, fileOps, migrations);

  const rows = db.raw
    .prepare('SELECT t.uuid AS uuid, p.uuid AS procedure FROM taper t JOIN procedure p ON p.id = t.procedure_id ORDER BY p.uuid')
    .all()
    .map((r) => ({ ...(r as object) }));
  assert.deepEqual(rows, [
    { uuid: 'newest', procedure: 'p1' },
    { uuid: 'tied-second', procedure: 'p2' }
  ]);
  assert.equal((db.raw.prepare('SELECT count(*) AS n FROM taper_session').get() as { n: number }).n, 1);
  assert.throws(() => db.raw.exec(taper('again', 'p1', 4000)), /UNIQUE/);
});
