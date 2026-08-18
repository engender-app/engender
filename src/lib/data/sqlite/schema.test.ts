/* Verifies the schema DDL itself (ticket 02's acceptance criteria): it
   applies cleanly through the migration runner, the deltas from the PRD
   schema landed, and the cascades the PRD relies on actually cascade.
   Part of the Node tier (ticket 03); run with `npm test`. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { migratedDb } from './test-support/migrated-db.ts';

test('applies cleanly to an empty database and sets user_version', async () => {
  const db = await migratedDb();
  assert.equal(db.getUserVersion(), 10);

  const tables = db.raw
    .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name")
    .all()
    .map((r) => (r as { name: string }).name);

  for (const expected of [
    'entry',
    'entry_body_region',
    'entry_dimension_value',
    'entry_tag',
    'gender_dimension',
    'gender_preset',
    'lab_result',
    'measurement',
    'medication_stock',
    'milestone',
    'photo',
    'pref',
    'preset_dimension',
    'regimen_episode',
    'reminder',
    'tag',
    'tag_group',
    'tally_event'
  ]) {
    assert.ok(tables.includes(expected), `expected table ${expected} to exist`);
  }
});

test('entry_fts is a contentless FTS5 table', async () => {
  const db = await migratedDb();
  const def = (
    db.raw
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'entry_fts'")
      .get() as { sql: string }
  ).sql;
  assert.match(def, /USING fts5/);
  assert.match(def, /content=''/);
});

test('v3 lets the index delete a row without being handed its old text', async () => {
  // Why this option, rather than the 'delete' command a plain contentless
  // table forces, is in migrations.ts on SCHEMA_V3.
  const db = await migratedDb();
  const def = (
    db.raw
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'entry_fts'")
      .get() as { sql: string }
  ).sql;
  assert.match(def, /contentless_delete=1/);

  db.raw.exec(
    "INSERT INTO entry (uuid, epoch_day, timestamp, note, updated_at) VALUES ('u1', 100, 1000, 'x', 1000)"
  );
  const id = (db.raw.prepare("SELECT id FROM entry WHERE uuid = 'u1'").get() as { id: number }).id;
  db.raw.prepare('INSERT INTO entry_fts (rowid, folded_text) VALUES (?, ?)').run(id, 'lozko');
  db.raw.prepare('DELETE FROM entry_fts WHERE rowid = ?').run(id);

  const hits = db.raw.prepare(`SELECT rowid FROM entry_fts WHERE entry_fts MATCH '"lozko"*'`).all();
  assert.deepEqual(hits, []);
});

test('v3 drops an entry out of the index when the entry row goes', async () => {
  // The trigger is what makes this hold for every delete path, including
  // ones written later that know nothing about the index - ticket 14's
  // Replace import deletes entry rows wholesale.
  const db = await migratedDb();
  db.raw.exec(
    "INSERT INTO entry (uuid, epoch_day, timestamp, note, updated_at) VALUES ('u1', 100, 1000, 'x', 1000)"
  );
  const id = (db.raw.prepare("SELECT id FROM entry WHERE uuid = 'u1'").get() as { id: number }).id;
  db.raw.prepare('INSERT INTO entry_fts (rowid, folded_text) VALUES (?, ?)').run(id, 'lozko');

  db.raw.prepare('DELETE FROM entry WHERE id = ?').run(id);

  const hits = db.raw.prepare(`SELECT rowid FROM entry_fts WHERE entry_fts MATCH '"lozko"*'`).all();
  assert.deepEqual(hits, []);
});

test('v2 adds gender_dimension.hidden, defaulting to visible', async () => {
  const db = await migratedDb();
  db.raw.exec(
    "INSERT INTO gender_dimension (key, name, low_label, high_label, updated_at) VALUES ('voice', 'Voice', 'low', 'high', 1000)"
  );
  const row = db.raw.prepare("SELECT hidden FROM gender_dimension WHERE key = 'voice'").get() as {
    hidden: number;
  };
  assert.equal(row.hidden, 0);
});

test('milestone drops kind, order_index and photo_path; reminder drops trigger_time', async () => {
  const db = await migratedDb();
  const milestoneColumns = (db.raw.prepare('PRAGMA table_info(milestone)').all() as Array<{ name: string }>).map(
    (c) => c.name
  );
  const reminderColumns = (db.raw.prepare('PRAGMA table_info(reminder)').all() as Array<{ name: string }>).map(
    (c) => c.name
  );

  for (const dropped of ['kind', 'order_index', 'photo_path']) {
    assert.ok(!milestoneColumns.includes(dropped), `milestone.${dropped} should be dropped`);
  }
  assert.ok(!reminderColumns.includes('trigger_time'), 'reminder.trigger_time should be dropped');
});

test('user-owned tables carry uuid and updated_at', async () => {
  const db = await migratedDb();
  for (const table of ['entry', 'photo', 'milestone', 'lab_result', 'measurement', 'reminder']) {
    const columns = (db.raw.prepare(`PRAGMA table_info(${table})`).all() as Array<{
      name: string;
      notnull: number;
    }>).reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.name]: c.notnull }), {});
    assert.equal(columns.uuid, 1, `${table}.uuid should be NOT NULL`);
    assert.equal(columns.updated_at, 1, `${table}.updated_at should be NOT NULL`);
  }
});

test('tag and gender_preset gain a nullable key column for built-ins', async () => {
  const db = await migratedDb();
  const tagColumns = db.raw.prepare('PRAGMA table_info(tag)').all() as Array<{ name: string; notnull: number }>;
  const presetColumns = db.raw
    .prepare('PRAGMA table_info(gender_preset)')
    .all() as Array<{ name: string; notnull: number }>;

  const tagKey = tagColumns.find((c) => c.name === 'key');
  const presetKey = presetColumns.find((c) => c.name === 'key');
  assert.ok(tagKey && tagKey.notnull === 0, 'tag.key should exist and be nullable');
  assert.ok(presetKey && presetKey.notnull === 0, 'gender_preset.key should exist and be nullable');
});

test('photo requires exactly one of entry_id or milestone_id', async () => {
  const db = await migratedDb();
  db.raw.exec(
    "INSERT INTO entry (uuid, epoch_day, timestamp, updated_at) VALUES ('e1', 1, 1000, 1000)"
  );

  assert.throws(() =>
    db.raw.exec("INSERT INTO photo (uuid, file_path, updated_at) VALUES ('p1', 'a.jpg', 1000)")
  );
  assert.throws(() =>
    db.raw.exec(
      "INSERT INTO photo (uuid, entry_id, milestone_id, file_path, updated_at) VALUES ('p2', 1, 1, 'a.jpg', 1000)"
    )
  );
  assert.doesNotThrow(() =>
    db.raw.exec("INSERT INTO photo (uuid, entry_id, file_path, updated_at) VALUES ('p3', 1, 'a.jpg', 1000)")
  );
});

test('reminder shape: one-off needs epoch_day, EVERY_N_DAYS needs interval and anchor', async () => {
  const db = await migratedDb();
  const insert = (sql: string) => db.raw.exec(sql);

  assert.doesNotThrow(() =>
    insert(
      "INSERT INTO reminder (uuid, title, type, time, epoch_day, updated_at) VALUES ('r1', 'Appt', 'appointment', '09:00', 100, 1000)"
    )
  );
  assert.doesNotThrow(() =>
    insert(
      "INSERT INTO reminder (uuid, title, type, time, recurrence, updated_at) VALUES ('r2', 'Pill', 'med', '20:00', 'DAILY', 1000)"
    )
  );
  assert.doesNotThrow(() =>
    insert(
      "INSERT INTO reminder (uuid, title, type, time, recurrence, interval, anchor_epoch_day, updated_at) VALUES ('r3', 'Patch', 'med', '20:00', 'EVERY_N_DAYS', 3, 50, 1000)"
    )
  );
  // Recurring but missing interval/anchor.
  assert.throws(() =>
    insert(
      "INSERT INTO reminder (uuid, title, type, time, recurrence, updated_at) VALUES ('r4', 'Patch', 'med', '20:00', 'EVERY_N_DAYS', 1000)"
    )
  );
  // Neither a recurrence nor a one-off day.
  assert.throws(() =>
    insert("INSERT INTO reminder (uuid, title, type, time, updated_at) VALUES ('r5', 'Nothing', 'other', '20:00', 1000)")
  );
});

test('v5 measurement carries no episode reference and rejects a type outside the fixed four', async () => {
  const db = await migratedDb();
  const columns = (db.raw.prepare('PRAGMA table_info(measurement)').all() as Array<{ name: string }>).map(
    (c) => c.name
  );
  assert.ok(!columns.some((name) => name.includes('episode')), 'measurement must not reference a regimen episode');

  assert.doesNotThrow(() =>
    db.raw.exec("INSERT INTO measurement (uuid, epoch_day, type, value, unit, updated_at) VALUES ('m1', 100, 'waist', 79, 'cm', 1000)")
  );
  assert.throws(() =>
    db.raw.exec("INSERT INTO measurement (uuid, epoch_day, type, value, unit, updated_at) VALUES ('m2', 100, 'thigh', 50, 'cm', 1000)")
  );
});

test('tally_event.kind accepts only the two counters', async () => {
  const db = await migratedDb();
  const insert = (kind: string) =>
    db.raw.exec(`INSERT INTO tally_event (uuid, epoch_day, kind, updated_at) VALUES ('t-${kind}', 100, '${kind}', 1000)`);

  assert.doesNotThrow(() => insert('misgendered'));
  assert.doesNotThrow(() => insert('correctly_gendered'));
  assert.throws(() => insert('confused'));
});

test('deleting an entry cascades to its photos, dimension values, tag links and body regions', async () => {
  const db = await migratedDb();
  const exec = (sql: string) => db.raw.exec(sql);

  exec("INSERT INTO entry (uuid, epoch_day, timestamp, updated_at) VALUES ('e1', 1, 1000, 1000)");
  exec(
    "INSERT INTO gender_dimension (key, name, low_label, high_label, updated_at) VALUES ('femininity', 'Femininity', 'low', 'high', 1000)"
  );
  exec("INSERT INTO entry_dimension_value (entry_id, dimension_id, value) VALUES (1, 1, 50)");
  exec("INSERT INTO tag_group (key, name, updated_at) VALUES ('emotions', 'Emotions', 1000)");
  exec("INSERT INTO tag (group_id, label, updated_at) VALUES (1, 'joy', 1000)");
  exec('INSERT INTO entry_tag (entry_id, tag_id) VALUES (1, 1)');
  exec("INSERT INTO photo (uuid, entry_id, file_path, updated_at) VALUES ('p1', 1, 'a.jpg', 1000)");
  exec("INSERT INTO entry_body_region (entry_id, region, intensity) VALUES (1, 'chest', 40)");

  // Foreign keys are off by default per connection in SQLite.
  exec('PRAGMA foreign_keys = ON');
  exec('DELETE FROM entry WHERE id = 1');

  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM photo').get()?.['n'], 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM entry_dimension_value').get()?.['n'], 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM entry_tag').get()?.['n'], 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM entry_body_region').get()?.['n'], 0);
  // The tag and dimension themselves are reference data and must survive.
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM tag').get()?.['n'], 1);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM gender_dimension').get()?.['n'], 1);
});
