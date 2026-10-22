/* FA 04: the closed lists leave SQL. Version 94 rebuilds the five tables whose
   vocabularies were CHECKs, so a stored value the code does not know no longer
   fails at the SQL level (it renders as "other"), and folds in the structural
   changes the hair-removal and tally tickets need so no table is rebuilt twice. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { runMigrations } from './migration-runner.ts';
import { migrations } from './migrations.ts';
import { migratedDb, noopFileOps } from './test-support/migrated-db.ts';
import { makeNodeSqliteDb } from './test-support/node-sqlite-driver.ts';

const REBUILT = ['hair_removal_session', 'tryout', 'tally_event', 'cycle_event', 'reminder'] as const;

/** A journal as the released schema 92 holds it, with a row in every rebuilt
    table and a child row for each parent a rebuild must not orphan. */
async function journalAt92() {
  const db = makeNodeSqliteDb();
  const fileOps = noopFileOps();
  await runMigrations(db, fileOps, migrations.filter((m) => m.version <= 92));
  const exec = (sql: string) => db.raw.exec(sql);
  exec(`INSERT INTO hair_removal_session (uuid, epoch_day, area, method, pain_rating, cost, provider, updated_at)
        VALUES ('h1', 100, 'chin', 'laser', 3, '40 EUR', 'Clinic', 1000), ('h2', 101, 'legs', 'other', 5, '', '', 1000)`);
  exec(`INSERT INTO hair_removal_photo (uuid, session_id, file_path, updated_at)
        VALUES ('hp1', (SELECT id FROM hair_removal_session WHERE uuid = 'h1'), 'a.jpg', 1000)`);
  exec(`INSERT INTO tryout (uuid, kind, label, description, start_epoch_day, end_epoch_day, updated_at)
        VALUES ('t1', 'name', 'Sam', NULL, 10, NULL, 1000), ('t2', 'style', 'Bob cut', 'short', 20, 30, 1000)`);
  exec(`INSERT INTO tryout_photo (uuid, tryout_id, epoch_day, file_path, updated_at)
        VALUES ('tp1', (SELECT id FROM tryout WHERE uuid = 't1'), 11, 'b.jpg', 1000)`);
  exec(`INSERT INTO felt_sense (uuid, tryout_id, epoch_day, mood, updated_at)
        VALUES ('fs1', (SELECT id FROM tryout WHERE uuid = 't2'), 21, 4, 1000)`);
  exec(`INSERT INTO milestone (uuid, name, epoch_day, tryout_id, updated_at) VALUES ('m1', 'First day', 12, 't1', 1000)`);
  exec(`INSERT INTO tally_event (uuid, epoch_day, kind, context, updated_at)
        VALUES ('y1', 5, 'misgendered', 'at work', 1000), ('y2', 6, 'correctly_gendered', NULL, 1000)`);
  exec(`INSERT INTO cycle_event (uuid, epoch_day, kind, updated_at)
        VALUES ('c1', 7, 'spotting', 1000), ('c2', 8, 'nothing_this_month', 1000)`);
  exec(`INSERT INTO reminder (uuid, title, type, time, recurrence, updated_at) VALUES ('r1', 'Pill', 'med', '20:00', 'DAILY', 1000)`);
  exec(`INSERT INTO reminder (uuid, title, type, time, epoch_day, updated_at) VALUES ('r2', 'Visit', 'appointment', '09:00', 100, 1000)`);
  return { db, fileOps };
}

const count = (db: ReturnType<typeof makeNodeSqliteDb>, table: string) =>
  (db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

test('an unknown value in each closed-list column inserts at the SQL level', async () => {
  const db = await migratedDb();
  const run = (sql: string) => db.raw.exec(sql);
  assert.doesNotThrow(() =>
    run(`INSERT INTO hair_removal_session (uuid, epoch_day, area, method, pain_rating, cost, provider, updated_at)
         VALUES ('h-area', 1, 'knees', 'laser', 3, '', '', 1)`)
  );
  assert.doesNotThrow(() =>
    run(`INSERT INTO hair_removal_session (uuid, epoch_day, area, method, pain_rating, cost, provider, updated_at)
         VALUES ('h-method', 1, 'chin', 'wax', 3, '', '', 1)`)
  );
  assert.doesNotThrow(() =>
    run(`INSERT INTO tryout (uuid, kind, label, start_epoch_day, updated_at) VALUES ('t-kind', 'hat', 'x', 1, 1)`)
  );
  assert.doesNotThrow(() =>
    run(`INSERT INTO tally_event (uuid, epoch_day, kind, updated_at) VALUES ('y-kind', 1, 'confused', 1)`)
  );
  assert.doesNotThrow(() =>
    run(`INSERT INTO cycle_event (uuid, epoch_day, kind, updated_at) VALUES ('c-kind', 1, 'irregular', 1)`)
  );
});

test('structural invariants stay in SQL: pain 1 to 5 when present, the reminder rule shape', async () => {
  const db = await migratedDb();
  const run = (sql: string) => db.raw.exec(sql);
  assert.throws(() =>
    run(`INSERT INTO hair_removal_session (uuid, epoch_day, area, method, pain_rating, provider, updated_at)
         VALUES ('h-pain', 1, 'chin', 'laser', 9, '', 1)`)
  );
  assert.throws(() =>
    run(`INSERT INTO reminder (uuid, title, time, updated_at) VALUES ('r-none', 'x', '20:00', 1)`)
  );
});

test('hair_removal_session takes no pain, no cost and a note; tally_event has no context', async () => {
  const db = await migratedDb();
  db.raw.exec(`INSERT INTO hair_removal_session (uuid, epoch_day, area, method, provider, note, updated_at)
               VALUES ('h1', 1, 'chin', 'laser', '', 'cost was unclear', 1)`);
  const row = db.raw.prepare('SELECT pain_rating, cost, note FROM hair_removal_session').get() as Record<string, unknown>;
  assert.deepEqual({ ...row }, { pain_rating: null, cost: null, note: 'cost was unclear' });
  const tally = (db.raw.prepare('PRAGMA table_info(tally_event)').all() as Array<{ name: string }>).map((c) => c.name);
  assert.ok(!tally.includes('context'));
});

test('migrating a populated 92 keeps every row, child link and id counter, and checks clean', async () => {
  const { db, fileOps } = await journalAt92();
  /* Deleted rows leave the AUTOINCREMENT counter above the highest id; the
     rebuild must not hand a deleted id out again. */
  db.raw.exec(`INSERT INTO cycle_event (uuid, epoch_day, kind, updated_at) VALUES ('gone', 9, 'spotting', 1)`);
  db.raw.exec(`DELETE FROM cycle_event WHERE uuid = 'gone'`);
  const seqOf = (table: string) =>
    (db.raw.prepare('SELECT seq FROM sqlite_sequence WHERE name = ?').get(table) as { seq: number } | undefined)?.seq;
  const before = Object.fromEntries(REBUILT.map((t) => [t, { rows: count(db, t), seq: seqOf(t) }]));
  const children = ['hair_removal_photo', 'tryout_photo', 'felt_sense', 'milestone'];
  const childrenBefore = children.map((t) => count(db, t));

  await runMigrations(db, fileOps, migrations);

  for (const table of REBUILT) {
    assert.equal(count(db, table), before[table].rows, `${table} row count`);
    assert.equal(seqOf(table), before[table].seq, `${table} id counter`);
  }
  assert.deepEqual(children.map((t) => count(db, t)), childrenBefore);
  assert.deepEqual(db.raw.prepare('PRAGMA foreign_key_check').all(), []);
  assert.deepEqual({ ...(db.raw.prepare('PRAGMA integrity_check').get() as object) }, { integrity_check: 'ok' });

  // The child still joins to its parent, by the same id.
  const photo = db.raw.prepare(`SELECT s.uuid AS session FROM hair_removal_photo p
                                JOIN hair_removal_session s ON s.id = p.session_id`).get() as { session: string };
  assert.equal(photo.session, 'h1');
  const hair = db.raw.prepare(`SELECT area, method, pain_rating, cost, note FROM hair_removal_session WHERE uuid = 'h1'`).get();
  assert.deepEqual({ ...(hair as object) }, { area: 'chin', method: 'laser', pain_rating: 3, cost: '40 EUR', note: null });

  // Indexes survive the rebuild of their tables. The legacy-weekly trigger
  // went with version 109 (functional audit ticket 08).
  const names = (db.raw.prepare(`SELECT name FROM sqlite_schema WHERE type IN ('index','trigger')`).all() as Array<{ name: string }>)
    .map((r) => r.name);
  for (const name of ['idx_hair_removal_session_epoch_day', 'idx_hair_removal_session_area', 'idx_tryout_start',
    'idx_tally_kind_day', 'idx_cycle_event_epoch_day']) {
    assert.ok(names.includes(name), `${name} still exists`);
  }
  assert.equal(count(db, 'tally_event'), 2);
});
