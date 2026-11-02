/* FA 50: migration hygiene before 1.0. Version 119 drops the columns nothing
   writes, renames the uuid-holding `*_id` columns to `*_uuid`, moves the
   device-local debrief state off `checklist` into `appointment_debrief`, and
   adds the voice analyzer's version. Each assertion is made on a journal that
   was on version 118 with rows in it, so a rebuild that loses a row, a
   counter, an index or a deletion trigger fails here. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { runMigrations } from './migration-runner.ts';
import { migrations } from './migrations.ts';
import { noopFileOps } from './test-support/migrated-db.ts';
import { makeNodeSqliteDb } from './test-support/node-sqlite-driver.ts';
import { dumpSchema } from './test-support/schema-dump.ts';

type Db = ReturnType<typeof makeNodeSqliteDb>;

const columnsOf = (db: Db, table: string) =>
  (db.raw.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name);

const triggerNames = (db: Db) =>
  (db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all() as Array<{ name: string }>).map(
    (t) => t.name
  );

/** A journal on version 118 holding one of everything the migration touches. */
async function journalOn118(): Promise<Db> {
  const db = makeNodeSqliteDb();
  await runMigrations(db, noopFileOps(), migrations.filter((m) => m.version <= 118));
  const run = (sql: string, ...params: Array<string | number | null>) => db.raw.prepare(sql).run(...params);
  run("INSERT INTO presentation (uuid, name, role_index, updated_at) VALUES ('pres-1', 'Fem', 0, 1)");
  run(
    "INSERT INTO entry (uuid, epoch_day, timestamp, mood, updated_at, presentation_id) VALUES ('e-1', 100, 1, 3, 1, 'pres-1')"
  );
  run(
    "INSERT INTO entry_template (uuid, name, presentation_id, updated_at) VALUES ('tpl-1', 'Day', 'pres-1', 1)"
  );
  run("INSERT INTO procedure (uuid, name, notes, updated_at) VALUES ('proc-1', 'Surgery', '', 1)");
  run("INSERT INTO tryout (uuid, kind, label, start_epoch_day, updated_at) VALUES ('try-1', 'x', 'Trial', 100, 1)");
  run(
    `INSERT INTO milestone (uuid, name, epoch_day, procedure_id, tryout_id, updated_at)
     VALUES ('m-1', 'Done', 100, 'proc-1', 'try-1', 1)`
  );
  run("INSERT INTO appointment (uuid, epoch_day, updated_at) VALUES ('appt-1', 100, 1)");
  run("INSERT INTO appointment (uuid, epoch_day, updated_at) VALUES ('appt-2', 101, 1)");
  run(
    `INSERT INTO checklist (uuid, updated_at, appointment_epoch_day, debrief_entry_id,
       debrief_entry_appointment_id, debrief_dismissed_appointment_id)
     VALUES ('c-1', 5, 100, 1, 'appt-1', 'appt-2')`
  );
  run("INSERT INTO checklist (uuid, owner_kind, owner_uuid, updated_at) VALUES ('c-2', 'procedure', 'proc-1', 6)");
  run("INSERT INTO checklist_item (uuid, checklist_id, content, updated_at) VALUES ('i-1', 1, 'ask', 1)");
  run(
    `INSERT INTO hair_removal_session (uuid, epoch_day, area, method, provider, updated_at, note, cost_amount, cost_currency)
     VALUES ('s-1', 100, 'face', 'laser', 'Clinic', 7, 'ok', 12.5, 'PLN')`
  );
  run("INSERT INTO hair_removal_photo (uuid, session_id, file_path, updated_at) VALUES ('hp-1', 1, 'a.jpg', 1)");
  run(
    `INSERT INTO voice_benchmark (uuid, epoch_day, timestamp, passage_key, passage_file_path, f0_median_hz,
       f0_p10_hz, f0_p90_hz, semitone_sd, words_per_minute, updated_at)
     VALUES ('vb-1', 100, 1, 'builtin', 'p.wav', 200, 180, 220, 1, 120, 1)`
  );
  return db;
}

async function migrated(): Promise<Db> {
  const db = await journalOn118();
  await runMigrations(db, noopFileOps(), migrations);
  return db;
}

test('version 119 drops the four columns nothing writes, and keeps the hidden flag', async () => {
  const db = await migrated();
  assert.deepEqual(columnsOf(db, 'checklist'), ['id', 'uuid', 'owner_kind', 'owner_uuid', 'updated_at']);
  assert.ok(!columnsOf(db, 'hair_removal_session').includes('cost'));
  assert.ok(columnsOf(db, 'regimen_episode').includes('hidden'));
  assert.ok(!columnsOf(db, 'tally_event').includes('context'));
});

test('version 119 keeps every row, counter and index of the tables it rebuilds', async () => {
  const db = await migrated();
  assert.deepEqual(db.raw.prepare('SELECT id, uuid, owner_kind, owner_uuid, updated_at FROM checklist ORDER BY id').all().map((r) => ({ ...r })), [
    { id: 1, uuid: 'c-1', owner_kind: null, owner_uuid: null, updated_at: 5 },
    { id: 2, uuid: 'c-2', owner_kind: 'procedure', owner_uuid: 'proc-1', updated_at: 6 }
  ]);
  // The child still reaches its parent by rowid.
  assert.deepEqual(db.raw.prepare('SELECT checklist_id FROM checklist_item').all().map((r) => ({ ...r })), [{ checklist_id: 1 }]);
  const [session] = db.raw.prepare('SELECT * FROM hair_removal_session').all() as Array<Record<string, unknown>>;
  assert.deepEqual(
    { uuid: session.uuid, note: session.note, amount: session.cost_amount, currency: session.cost_currency, at: session.updated_at },
    { uuid: 's-1', note: 'ok', amount: 12.5, currency: 'PLN', at: 7 }
  );
  assert.deepEqual(db.raw.prepare('SELECT session_id FROM hair_removal_photo').all().map((r) => ({ ...r })), [{ session_id: 1 }]);
  // An id that was deleted is not handed out again.
  db.raw.prepare("DELETE FROM checklist WHERE uuid = 'c-2'").run();
  db.raw.prepare("INSERT INTO checklist (uuid, updated_at) VALUES ('c-3', 1)").run();
  assert.equal((db.raw.prepare("SELECT id FROM checklist WHERE uuid = 'c-3'").get() as { id: number }).id, 3);
  const indexes = (table: string) =>
    (db.raw.prepare(`PRAGMA index_list(${table})`).all() as Array<{ name: string }>).map((i) => i.name);
  assert.ok(indexes('checklist').includes('idx_checklist_owner'));
  assert.ok(indexes('hair_removal_session').includes('idx_hair_removal_session_epoch_day'));
  assert.ok(indexes('hair_removal_session').includes('idx_hair_removal_session_area'));
});

test('version 119 puts the deletion trigger back on every table it rebuilds', async () => {
  const db = await migrated();
  for (const table of ['checklist', 'hair_removal_session']) {
    assert.ok(triggerNames(db).includes(`deletion_${table}`), `${table} lost its deletion trigger`);
  }
  db.raw.prepare("DELETE FROM hair_removal_session WHERE uuid = 's-1'").run();
  db.raw.prepare("DELETE FROM checklist WHERE uuid = 'c-1'").run();
  assert.deepEqual(
    db.raw.prepare("SELECT tbl, row_key FROM deletion WHERE tbl IN ('checklist', 'hair_removal_session') ORDER BY tbl").all().map((r) => ({ ...r })),
    [
      { tbl: 'checklist', row_key: 'c-1' },
      { tbl: 'hair_removal_session', row_key: 's-1' }
    ]
  );
});

test('version 119 renames the uuid-holding id columns and keeps what they held', async () => {
  const db = await migrated();
  assert.ok(columnsOf(db, 'entry').includes('presentation_uuid') && !columnsOf(db, 'entry').includes('presentation_id'));
  assert.ok(columnsOf(db, 'entry_template').includes('presentation_uuid'));
  assert.ok(!columnsOf(db, 'entry_template').includes('presentation_id'));
  assert.ok(columnsOf(db, 'milestone').includes('procedure_uuid') && columnsOf(db, 'milestone').includes('tryout_uuid'));
  assert.ok(!columnsOf(db, 'milestone').includes('procedure_id') && !columnsOf(db, 'milestone').includes('tryout_id'));
  assert.deepEqual({ ...db.raw.prepare('SELECT presentation_uuid FROM entry').get() }, { presentation_uuid: 'pres-1' });
  assert.deepEqual({ ...db.raw.prepare('SELECT presentation_uuid FROM entry_template').get() }, { presentation_uuid: 'pres-1' });
  assert.deepEqual({ ...db.raw.prepare('SELECT procedure_uuid, tryout_uuid FROM milestone').get() }, {
    procedure_uuid: 'proc-1',
    tryout_uuid: 'try-1'
  });
  // The foreign keys follow the rename, and the index is named for the column.
  const fks = (table: string) =>
    (db.raw.prepare(`PRAGMA foreign_key_list(${table})`).all() as Array<{ from: string; table: string; to: string }>).map(
      (f) => `${f.from}->${f.table}.${f.to}`
    );
  assert.ok(fks('milestone').includes('procedure_uuid->procedure.uuid'));
  assert.ok(fks('milestone').includes('tryout_uuid->tryout.uuid'));
  assert.ok(fks('entry').includes('presentation_uuid->presentation.uuid'));
  const names = (db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as Array<{ name: string }>).map((i) => i.name);
  assert.ok(names.includes('idx_entry_presentation_uuid') && !names.includes('idx_entry_presentation_id'));
});

test('version 119 moves the debrief state to appointment_debrief, one row per appointment', async () => {
  const db = await migrated();
  assert.deepEqual(
    db.raw.prepare('SELECT appointment_uuid, entry_id, dismissed FROM appointment_debrief ORDER BY appointment_uuid').all().map((r) => ({ ...r })),
    [
      { appointment_uuid: 'appt-1', entry_id: 1, dismissed: 0 },
      { appointment_uuid: 'appt-2', entry_id: null, dismissed: 1 }
    ]
  );
  // A purged entry leaves the appointment looking un-debriefed again.
  db.raw.exec('PRAGMA foreign_keys = ON');
  db.raw.prepare('DELETE FROM entry WHERE id = 1').run();
  assert.deepEqual({ ...db.raw.prepare("SELECT entry_id FROM appointment_debrief WHERE appointment_uuid = 'appt-1'").get() }, { entry_id: null });
});

test('version 119 adds the analyzer version, null on a benchmark taken before it', async () => {
  const db = await migrated();
  assert.ok(columnsOf(db, 'voice_benchmark').includes('analyzer_version'));
  assert.deepEqual({ ...db.raw.prepare('SELECT analyzer_version FROM voice_benchmark').get() }, { analyzer_version: null });
});

test('version 119 leaves the media file view and the integrity of the journal as they were', async () => {
  const before = await journalOn118();
  const viewBefore = dumpSchema(before.raw).split('\n').filter((l) => l.includes('CREATE VIEW media_file'));
  const db = await migrated();
  assert.deepEqual(dumpSchema(db.raw).split('\n').filter((l) => l.includes('CREATE VIEW media_file')), viewBefore);
  assert.deepEqual(db.raw.prepare('PRAGMA integrity_check').all().map((r) => ({ ...r })), [{ integrity_check: 'ok' }]);
  assert.deepEqual(db.raw.prepare('PRAGMA foreign_key_check').all(), []);
});
