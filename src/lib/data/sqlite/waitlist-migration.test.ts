/* an appointment can wait without a date. Version 100 rebuilds `appointment` so `epoch_day`
   is nullable and the day somebody was referred on has a column, and adds
   `appointment_status` for the dated updates a wait collects. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { runMigrations } from './migration-runner.ts';
import { migrations } from './migrations.ts';
import { migratedDb, noopFileOps } from './test-support/migrated-db.ts';
import { makeNodeSqliteDb } from './test-support/node-sqlite-driver.ts';

const count = (db: ReturnType<typeof makeNodeSqliteDb>, table: string) =>
  (db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

test('an appointment inserts with no day and a referred-on day', async () => {
  const db = await migratedDb();
  assert.doesNotThrow(() =>
    db.raw.exec(`INSERT INTO appointment (uuid, epoch_day, referred_epoch_day, kind, updated_at)
                 VALUES ('w1', NULL, 19000, 'Gender clinic', 1)`)
  );
  const row = db.raw.prepare(`SELECT epoch_day, referred_epoch_day FROM appointment WHERE uuid = 'w1'`).get();
  assert.deepEqual({ ...(row as object) }, { epoch_day: null, referred_epoch_day: 19000 });
});

test('a status update belongs to one appointment, has a day and text, and goes with it', async () => {
  const db = await migratedDb();
  db.raw.exec(`INSERT INTO appointment (uuid, epoch_day, updated_at) VALUES ('w1', NULL, 1)`);
  db.raw.exec(`INSERT INTO appointment_status (uuid, appointment_id, epoch_day, status, updated_at)
               VALUES ('s1', (SELECT id FROM appointment WHERE uuid = 'w1'), 19100, 'Letter came', 1)`);
  assert.throws(() =>
    db.raw.exec(`INSERT INTO appointment_status (uuid, appointment_id, status, updated_at)
                 VALUES ('s2', (SELECT id FROM appointment WHERE uuid = 'w1'), 'no day', 1)`)
  );
  const columns = (db.raw.prepare('PRAGMA table_info(appointment_status)').all() as Array<{ name: string; notnull: number }>)
    .reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.name]: c.notnull }), {});
  assert.equal(columns.uuid, 1);
  assert.equal(columns.updated_at, 1);
  db.raw.exec(`DELETE FROM appointment WHERE uuid = 'w1'`);
  assert.equal(count(db, 'appointment_status'), 0);
});

test('migrating a populated 94 keeps every appointment, its procedure link and the id counter', async () => {
  const db = makeNodeSqliteDb();
  const fileOps = noopFileOps();
  await runMigrations(db, fileOps, migrations.filter((m) => m.version <= 94));
  db.raw.exec(`INSERT INTO procedure (uuid, name, surgery_epoch_day, notes, updated_at) VALUES ('p1', 'Top', NULL, '', 1)`);
  db.raw.exec(`INSERT INTO appointment (uuid, procedure_id, epoch_day, kind, place, note, updated_at)
               VALUES ('a1', NULL, 100, 'endo', 'Clinic', 'dose', 1000),
                      ('a2', (SELECT id FROM procedure WHERE uuid = 'p1'), 200, NULL, NULL, NULL, 1000),
                      ('gone', NULL, 300, NULL, NULL, NULL, 1000)`);
  db.raw.exec(`DELETE FROM appointment WHERE uuid = 'gone'`);
  const seq = () => (db.raw.prepare(`SELECT seq FROM sqlite_sequence WHERE name = 'appointment'`).get() as { seq: number }).seq;
  const seqBefore = seq();

  await runMigrations(db, fileOps, migrations);

  assert.equal(count(db, 'appointment'), 2);
  assert.equal(seq(), seqBefore);
  const rows = db.raw
    .prepare(`SELECT a.uuid AS uuid, a.epoch_day AS day, a.referred_epoch_day AS referred, a.kind AS kind,
                     a.place AS place, a.note AS note, r.uuid AS procedure
                FROM appointment a LEFT JOIN procedure r ON r.id = a.procedure_id ORDER BY a.id`)
    .all()
    .map((r) => ({ ...(r as object) }));
  assert.deepEqual(rows, [
    { uuid: 'a1', day: 100, referred: null, kind: 'endo', place: 'Clinic', note: 'dose', procedure: null },
    { uuid: 'a2', day: 200, referred: null, kind: null, place: null, note: null, procedure: 'p1' }
  ]);
  assert.deepEqual(db.raw.prepare('PRAGMA foreign_key_check').all(), []);
  assert.deepEqual({ ...(db.raw.prepare('PRAGMA integrity_check').get() as object) }, { integrity_check: 'ok' });

  const names = (db.raw.prepare(`SELECT name FROM sqlite_schema WHERE type = 'index'`).all() as Array<{ name: string }>)
    .map((r) => r.name);
  for (const name of ['idx_appointment_procedure', 'idx_appointment_epoch_day', 'idx_appointment_status_appointment']) {
    assert.ok(names.includes(name), `${name} exists`);
  }

  // A procedure still takes its consults with it after the rebuild.
  db.raw.exec(`DELETE FROM procedure WHERE uuid = 'p1'`);
  assert.equal(count(db, 'appointment'), 1);
});
