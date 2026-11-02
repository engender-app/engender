/* FA 27: an appointment keeps its time of day and can name who it was with.
   Version 110 adds `appointment.time_of_day` and `appointment.provider_id`
   after FA 26's rebuild, as plain ADD COLUMNs, and a `provider` table for the
   person's own notes on the people they see. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { runMigrations } from './migration-runner.ts';
import { preSquashChain } from './test-support/pre-squash-chain.ts';
import { migratedDb, noopFileOps } from './test-support/migrated-db.ts';
import { makeNodeSqliteDb } from './test-support/node-sqlite-driver.ts';

const columnsOf = (db: ReturnType<typeof makeNodeSqliteDb>, table: string) =>
  (db.raw.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string; notnull: number }>).reduce<
    Record<string, number>
  >((acc, c) => ({ ...acc, [c.name]: c.notnull }), {});

test('a provider has a uuid, a name and updated_at, and the rest is optional', async () => {
  const db = await migratedDb();
  const columns = columnsOf(db, 'provider');
  assert.deepEqual(Object.keys(columns).sort(), [
    'competence', 'contact', 'id', 'impressions', 'name', 'updated_at', 'uuid'
  ]);
  assert.equal(columns.uuid, 1);
  assert.equal(columns.name, 1);
  assert.equal(columns.updated_at, 1);
  assert.doesNotThrow(() =>
    db.raw.exec(`INSERT INTO provider (uuid, name, updated_at) VALUES ('p1', 'Dr Nowak', 1)`)
  );
});

test('an appointment stores a time and a provider, and outlives the provider', async () => {
  const db = await migratedDb();
  db.raw.exec(`INSERT INTO provider (uuid, name, updated_at) VALUES ('p1', 'Dr Nowak', 1)`);
  db.raw.exec(`INSERT INTO appointment (uuid, epoch_day, time_of_day, provider_id, updated_at)
               VALUES ('a1', 100, '14:30', (SELECT id FROM provider WHERE uuid = 'p1'), 1)`);
  db.raw.exec(`DELETE FROM provider WHERE uuid = 'p1'`);
  const row = db.raw.prepare(`SELECT time_of_day, provider_id FROM appointment WHERE uuid = 'a1'`).get();
  assert.deepEqual({ ...(row as object) }, { time_of_day: '14:30', provider_id: null });
});

test('migrating a populated 109 keeps every appointment column, the wait and its updates', async () => {
  const db = makeNodeSqliteDb();
  const fileOps = noopFileOps();
  await runMigrations(db, fileOps, preSquashChain.filter((m) => m.version <= 109));
  db.raw.exec(`INSERT INTO appointment (uuid, epoch_day, kind, place, note, referred_epoch_day, updated_at)
               VALUES ('a1', 100, 'endo', 'Clinic', 'dose', NULL, 1000),
                      ('w1', NULL, 'Gender clinic', NULL, NULL, 90, 1000)`);
  db.raw.exec(`INSERT INTO appointment_status (uuid, appointment_id, epoch_day, status, updated_at)
               VALUES ('s1', (SELECT id FROM appointment WHERE uuid = 'w1'), 95, 'Letter came', 1000)`);

  await runMigrations(db, fileOps, preSquashChain);

  const rows = db.raw
    .prepare(`SELECT uuid, epoch_day, kind, place, note, referred_epoch_day, time_of_day, provider_id
                FROM appointment ORDER BY id`)
    .all()
    .map((r) => ({ ...(r as object) }));
  assert.deepEqual(rows, [
    { uuid: 'a1', epoch_day: 100, kind: 'endo', place: 'Clinic', note: 'dose', referred_epoch_day: null, time_of_day: null, provider_id: null },
    { uuid: 'w1', epoch_day: null, kind: 'Gender clinic', place: null, note: null, referred_epoch_day: 90, time_of_day: null, provider_id: null }
  ]);
  assert.equal((db.raw.prepare('SELECT COUNT(*) AS n FROM appointment_status').get() as { n: number }).n, 1);
  assert.deepEqual(db.raw.prepare('PRAGMA foreign_key_check').all(), []);
  assert.deepEqual({ ...(db.raw.prepare('PRAGMA integrity_check').get() as object) }, { integrity_check: 'ok' });
});
