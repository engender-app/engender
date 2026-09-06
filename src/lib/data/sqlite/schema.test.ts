/* Verifies the schema DDL itself (ticket 02's acceptance criteria): it
   applies cleanly through the migration runner, the deltas from the PRD
   schema landed, and the cascades the PRD relies on actually cascade.
   Part of the Node tier (ticket 03); run with `npm test`. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migratedDb, noopFileOps } from './test-support/migrated-db.ts';
import { runMigrations } from './migration-runner.ts';
import { migrations } from './migrations.ts';
import { LATEST_SCHEMA_VERSION } from './schema-version.ts';
import { makeNodeSqliteDb } from './test-support/node-sqlite-driver.ts';
import { dumpSchema } from './test-support/schema-dump.ts';

/* The version the squash landed on (ticket 34): one baseline statement in
   place of the 78 steps that used to build up to it, keeping the number those
   steps had reached so a journal already on the current schema opens without
   anything running against it. Hardcoded rather than read off
   LATEST_SCHEMA_VERSION, which moves on as migrations are added after it. */
const SQUASH_BASELINE_VERSION = 78;

test('the squashed baseline builds the schema the 78-step chain built', async () => {
  /* The ground truth is a dump taken from a database the real 78-step chain
     built, frozen at the commit that retired the chain - the chain itself is
     in git history from there, not in the tree, so this file is the only thing
     left that remembers what it produced. Compared through dumpSchema, which
     forgives comments, whitespace and the quoting ALTER TABLE leaves behind,
     so the baseline is free to be written as a readable column list rather
     than as the appended-column text SQLite happened to store. */
  const expected = readFileSync(new URL('./test-support/pre-squash-schema.txt', import.meta.url), 'utf8');

  const db = makeNodeSqliteDb();
  await runMigrations(
    db,
    noopFileOps(),
    migrations.filter((m) => m.version <= SQUASH_BASELINE_VERSION)
  );

  assert.equal(db.getUserVersion(), SQUASH_BASELINE_VERSION);
  assert.equal(dumpSchema(db.raw) + '\n', expected);
});

test('the squash left one migration standing where there were 78', async () => {
  const upToBaseline = migrations.filter((m) => m.version <= SQUASH_BASELINE_VERSION);
  assert.deepEqual(
    upToBaseline.map((m) => m.version),
    [SQUASH_BASELINE_VERSION]
  );
});

test('applies cleanly to an empty database and sets user_version', async () => {
  const db = await migratedDb();
  // Deliberate oracle: the one hardcoded version in this suite, so a runner
  // bug that stalls user_version can't hide behind the derived constant.
  assert.equal(db.getUserVersion(), 78);

  const tables = db.raw
    .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name")
    .all()
    .map((r) => (r as { name: string }).name);

  for (const expected of [
    'affirmation',
    'appointment',
    'area_state',
    'comfort_item',
    'cycle_event',
    'entry',
    'entry_body_region',
    'entry_dimension_value',
    'entry_tag',
    'era',
    'era_mute',
    'gender_dimension',
    'gender_preset',
    'hair_photo',
    'hair_stage',
    'lab_result',
    'measurement',
    'measurement_type',
    'medication_stock',
    'milestone',
    'effect_category',
    'personal_effect',
    'personal_effect_type',
    'photo',
    'presentation',
    'pref',
    'preset_dimension',
    'regimen_episode',
    'reminder',
    'revisit',
    'side_effect',
    'tag',
    'tag_group',
    'tally_event',
    'video_note',
    'voice_benchmark',
    'voice_recording',
    'wear_session'
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

test('v26 adds entry.starred and photo.starred, defaulting to unstarred', async () => {
  const db = await migratedDb();
  db.raw.exec("INSERT INTO entry (uuid, epoch_day, timestamp, note, updated_at) VALUES ('e1', 100, 1000, '', 1000)");
  const entryId = (db.raw.prepare("SELECT id FROM entry WHERE uuid = 'e1'").get() as { id: number }).id;
  db.raw.exec(
    `INSERT INTO photo (uuid, entry_id, file_path, updated_at) VALUES ('p1', ${entryId}, 'p1.jpg', 1000)`
  );

  const entryRow = db.raw.prepare("SELECT starred FROM entry WHERE uuid = 'e1'").get() as { starred: number };
  const photoRow = db.raw.prepare("SELECT starred FROM photo WHERE uuid = 'p1'").get() as { starred: number };
  assert.equal(entryRow.starred, 0);
  assert.equal(photoRow.starred, 0);
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
  for (const table of ['entry', 'photo', 'milestone', 'lab_result', 'measurement', 'side_effect', 'reminder', 'cycle_event']) {
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

test('v5 measurement carries no episode reference; v34 opens its type past the built-in four', async () => {
  const db = await migratedDb();
  const columns = (db.raw.prepare('PRAGMA table_info(measurement)').all() as Array<{ name: string }>).map(
    (c) => c.name
  );
  assert.ok(!columns.some((name) => name.includes('episode')), 'measurement must not reference a regimen episode');

  assert.doesNotThrow(() =>
    db.raw.exec("INSERT INTO measurement (uuid, epoch_day, type, value, unit, updated_at) VALUES ('m1', 100, 'waist', 79, 'cm', 1000)")
  );
  // The v5 CHECK enumerated four types; v34 drops it, so a custom type's
  // minted uuid (or, as here, any other key) inserts cleanly.
  assert.doesNotThrow(() =>
    db.raw.exec("INSERT INTO measurement (uuid, epoch_day, type, value, unit, updated_at) VALUES ('m2', 100, 'thigh', 50, 'cm', 1000)")
  );
});

test('v34 gives measurement_type the same key NOT NULL / uuid nullable shape gender_dimension has', async () => {
  const db = await migratedDb();
  const columns = (db.raw.prepare('PRAGMA table_info(measurement_type)').all() as Array<{
    name: string;
    notnull: number;
  }>).map((c) => ({ name: c.name, notnull: c.notnull }));
  assert.ok(columns.some((c) => c.name === 'key' && c.notnull === 1), 'key must be NOT NULL');
  assert.ok(columns.some((c) => c.name === 'uuid' && c.notnull === 0), 'uuid must be nullable');

  assert.doesNotThrow(() =>
    db.raw.exec("INSERT INTO measurement_type (key, name, is_built_in, updated_at) VALUES ('waist', '', 1, 1000)")
  );
  assert.doesNotThrow(() =>
    db.raw.exec(
      "INSERT INTO measurement_type (uuid, key, name, is_built_in, updated_at) VALUES ('u1', 'u1', 'Shoulders', 0, 1000)"
    )
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

test('v21 cycle_event carries no episode reference and accepts only its three kinds', async () => {
  const db = await migratedDb();
  const columns = (db.raw.prepare('PRAGMA table_info(cycle_event)').all() as Array<{ name: string }>).map(
    (c) => c.name
  );
  assert.ok(!columns.some((name) => name.includes('episode')), 'cycle_event must not reference a regimen episode');

  const insert = (kind: string) =>
    db.raw.exec(`INSERT INTO cycle_event (uuid, epoch_day, kind, updated_at) VALUES ('c-${kind}', 100, '${kind}', 1000)`);

  assert.doesNotThrow(() => insert('period_occurred'));
  assert.doesNotThrow(() => insert('spotting'));
  assert.doesNotThrow(() => insert('nothing_this_month'));
  assert.throws(() => insert('irregular'));
});

test('side_effect carries no episode reference, takes a blank severity and rejects one outside 1-5', async () => {
  const db = await migratedDb();
  const columns = (db.raw.prepare('PRAGMA table_info(side_effect)').all() as Array<{ name: string }>).map(
    (c) => c.name
  );
  assert.ok(!columns.some((name) => name.includes('episode')), 'side_effect must not reference a regimen episode');

  assert.doesNotThrow(() =>
    db.raw.exec("INSERT INTO side_effect (uuid, name, severity, epoch_day, updated_at) VALUES ('s1', 'nausea', 1, 100, 1000)")
  );
  // Blank is a real answer: the screen introduces itself as "no grading and
  // no advice", so an ungraded record must not be forced to a number.
  assert.doesNotThrow(() =>
    db.raw.exec("INSERT INTO side_effect (uuid, name, severity, epoch_day, updated_at) VALUES ('s2', 'headache', NULL, 100, 1000)")
  );
  assert.throws(() =>
    db.raw.exec("INSERT INTO side_effect (uuid, name, severity, epoch_day, updated_at) VALUES ('s3', 'nausea', 0, 100, 1000)")
  );
  assert.throws(() =>
    db.raw.exec("INSERT INTO side_effect (uuid, name, severity, epoch_day, updated_at) VALUES ('s4', 'nausea', 6, 100, 1000)")
  );
});

test('a body region says dysphoria, euphoria or both, and the two are independent', async () => {
  const db = await migratedDb();
  db.raw.exec("INSERT INTO entry (uuid, epoch_day, timestamp, updated_at) VALUES ('e1', 100, 1000, 1000)");

  db.raw.exec("INSERT INTO entry_body_region (entry_id, region, dysphoria, euphoria) VALUES (1, 'chest', 70, NULL)");
  db.raw.exec("INSERT INTO entry_body_region (entry_id, region, dysphoria, euphoria) VALUES (1, 'hair', NULL, 40)");
  db.raw.exec("INSERT INTO entry_body_region (entry_id, region, dysphoria, euphoria) VALUES (1, 'hips', 20, 60)");

  const rows = db.raw
    .prepare('SELECT region, dysphoria, euphoria FROM entry_body_region ORDER BY region')
    .all()
    // node:sqlite hands back null-prototype rows, which deepEqual will not
    // match against a plain object literal.
    .map((r) => ({ ...(r as { region: string; dysphoria: number | null; euphoria: number | null }) }));
  // An axis left out reads null rather than 0 - a 0 would claim they said
  // something about it.
  assert.deepEqual(rows, [
    { region: 'chest', dysphoria: 70, euphoria: null },
    { region: 'hair', dysphoria: null, euphoria: 40 },
    { region: 'hips', dysphoria: 20, euphoria: 60 }
  ]);
});

test('v36 refuses a body region that says nothing on either axis', async () => {
  const db = await migratedDb();
  db.raw.exec("INSERT INTO entry (uuid, epoch_day, timestamp, updated_at) VALUES ('e1', 100, 1000, 1000)");

  assert.throws(() =>
    db.raw.exec("INSERT INTO entry_body_region (entry_id, region, dysphoria, euphoria) VALUES (1, 'chest', NULL, NULL)")
  );
});


test('measurement.type is open past the built-in four, with no CHECK to reopen', async () => {
  const db = await migratedDb();

  // The closed four became a reference-data vocabulary: a key outside them -
  // including one shaped like a custom type's minted uuid - inserts cleanly,
  // and what may be there is decided a layer up, by measurement_type.
  assert.doesNotThrow(() =>
    db.raw.exec(
      "INSERT INTO measurement (uuid, epoch_day, type, value, unit, updated_at) VALUES ('m2', 19180, 'a1b2c3d4-uuid', 30, 'cm', 1000)"
    )
  );
});

test('personal_effect.effect is an open catalogue, and effect_category/personal_effect_type hold it', async () => {
  const db = await migratedDb();

  // No CHECK: a key outside the old closed eight - including one shaped like
  // a custom effect type's minted uuid - inserts cleanly.
  assert.doesNotThrow(() =>
    db.raw.exec(
      "INSERT INTO personal_effect (uuid, effect, first_noticed_epoch_day, updated_at) VALUES ('pe2', 'a1b2c3d4-uuid', 100, 1000)"
    )
  );

  const categoryTable = db.raw
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'effect_category'")
    .get();
  assert.ok(categoryTable, 'effect_category table exists');
  db.raw.exec("INSERT INTO effect_category (key, name, enabled, updated_at) VALUES ('body_shape', '', 1, 1000)");

  const typeTable = db.raw
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'personal_effect_type'")
    .get();
  assert.ok(typeTable, 'personal_effect_type table exists');
  assert.doesNotThrow(() =>
    db.raw.exec(
      "INSERT INTO personal_effect_type (key, name, category_key, direction, hidden, updated_at) VALUES ('breast_development', '', 'body_shape', 'feminizing', 0, 1000)"
    )
  );
  assert.throws(() =>
    db.raw.exec(
      "INSERT INTO personal_effect_type (uuid, key, name, direction, hidden, updated_at) VALUES ('c1', 'c1', 'My own thing', 'not_a_direction', 0, 1000)"
    )
  );
});

type HairStageDb = Awaited<ReturnType<typeof migratedDb>>;

const insertHairStage =
  (db: HairStageDb) =>
  (uuid: string, scale: string, stage: string, description = '') =>
    db.raw.exec(
      `INSERT INTO hair_stage (uuid, epoch_day, scale, stage, description, updated_at) VALUES ('${uuid}', 100, '${scale}', '${stage}', '${description}', 1000)`
    );

test('v37 hair_stage rejects a grade the named scale does not publish', async () => {
  const db = await migratedDb();
  const insert = insertHairStage(db);

  assert.doesNotThrow(() => insert('h1', 'norwood_hamilton', '3v'));
  assert.doesNotThrow(() => insert('h2', 'sinclair', '5'));

  // '3v' and '7' are Norwood-Hamilton codes and Sinclair publishes neither,
  // so the pair is refused even though each half is valid somewhere.
  assert.throws(() => insert('h3', 'sinclair', '3v'));
  assert.throws(() => insert('h4', 'sinclair', '7'));
  assert.throws(() => insert('h5', 'norwood_hamilton', '8'));
  assert.throws(() => insert('h6', 'ludwig', 'ii'));
});

test('v37 hair_stage keeps a free-text description to the scale that has no grades', async () => {
  const db = await migratedDb();
  const insert = insertHairStage(db);

  assert.doesNotThrow(() => insert('h1', 'other', '', 'diffuse thinning all over the top'));
  // Neither of these, and nothing written down, is a record too.
  assert.doesNotThrow(() => insert('h2', 'other', ''));

  assert.throws(() => insert('h3', 'other', '3'));
  assert.throws(() => insert('h4', 'norwood_hamilton', '3', 'and some prose'));
});


test('a dose schedule cannot claim one recurrence shape while carrying the other one data', async () => {
  const db = await migratedDb();
  db.raw.exec(
    "INSERT INTO regimen_episode (uuid, drug, dose, dose_unit, route, interval, start_epoch_day, updated_at) VALUES ('e1', 'estradiol valerate', 4, 'mg', 'im', 'every 2 weeks', 19000, 1000)"
  );

  // The discriminated union, enforced in SQL as well as in code: the
  // every-N-days arm needs its step, and the weekdays arm must not carry one.
  assert.doesNotThrow(() =>
    db.raw.exec(
      "INSERT INTO dose_schedule (uuid, episode_id, recurrence_kind, every_n_days, doses_per_day, updated_at) VALUES ('s1', 1, 'everyNDays', 14, 1, 1000)"
    )
  );
  assert.throws(() =>
    db.raw.exec(
      "INSERT INTO dose_schedule (uuid, episode_id, recurrence_kind, every_n_days, doses_per_day, updated_at) VALUES ('s2', 1, 'weekdays', 14, 1, 1000)"
    )
  );
  assert.throws(() =>
    db.raw.exec(
      "INSERT INTO dose_schedule (uuid, episode_id, recurrence_kind, every_n_days, doses_per_day, updated_at) VALUES ('s3', 1, 'everyNDays', NULL, 1, 1000)"
    )
  );

  // Weekdays and amounts are child tables, so a schedule that does not use
  // the shape they belong to simply has none of them.
  assert.equal((db.raw.prepare('SELECT COUNT(*) AS n FROM dose_schedule_weekday').get() as { n: number }).n, 0);
  assert.equal((db.raw.prepare('SELECT COUNT(*) AS n FROM dose_schedule_dose_amount').get() as { n: number }).n, 0);
});

test('v13 hair_photo is its own table, not a third owner on photo', async () => {
  const db = await migratedDb();
  const columns = (db.raw.prepare('PRAGMA table_info(hair_photo)').all() as Array<{ name: string }>).map(
    (c) => c.name
  );
  assert.ok(!columns.some((name) => name.includes('entry') || name.includes('milestone')));

  assert.doesNotThrow(() =>
    db.raw.exec("INSERT INTO hair_photo (uuid, epoch_day, file_path, updated_at) VALUES ('hp1', 100, 'hp1.jpg', 1000)")
  );
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
  exec("INSERT INTO entry_body_region (entry_id, region, dysphoria, euphoria) VALUES (1, 'chest', 40, 65)");
  exec("INSERT INTO voice_recording (uuid, entry_id, file_path, updated_at) VALUES ('v1', 1, 'v1.webm', 1000)");
  exec("INSERT INTO video_note (uuid, entry_id, file_path, updated_at) VALUES ('n1', 1, 'n1.webm', 1000)");

  // Foreign keys are off by default per connection in SQLite.
  exec('PRAGMA foreign_keys = ON');
  exec('DELETE FROM entry WHERE id = 1');

  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM photo').get()?.['n'], 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM entry_dimension_value').get()?.['n'], 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM entry_tag').get()?.['n'], 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM entry_body_region').get()?.['n'], 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM voice_recording').get()?.['n'], 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM video_note').get()?.['n'], 0);
  // The tag and dimension themselves are reference data and must survive.
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM tag').get()?.['n'], 1);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM gender_dimension').get()?.['n'], 1);
});

test('v24 entry gets a nullable trashed_at column, indexed, defaulting to NULL', async () => {
  const db = await migratedDb();
  const columns = (db.raw.prepare('PRAGMA table_info(entry)').all() as Array<{
    name: string;
    notnull: number;
  }>);
  const trashedAt = columns.find((c) => c.name === 'trashed_at');
  assert.ok(trashedAt, 'entry.trashed_at should exist');
  assert.equal(trashedAt!.notnull, 0);

  db.raw.exec("INSERT INTO entry (uuid, epoch_day, timestamp, updated_at) VALUES ('e1', 1, 1000, 1000)");
  assert.equal(db.raw.prepare('SELECT trashed_at FROM entry WHERE uuid = ?').get('e1')?.['trashed_at'], null);

  const indexes = (db.raw.prepare("PRAGMA index_list(entry)").all() as Array<{ name: string }>).map((i) => i.name);
  assert.ok(indexes.includes('idx_entry_trashed_at'));
});

test('an episode ends only when it is ended, and a dose names its own drug or nothing', async () => {
  const db = await migratedDb();
  db.raw.exec(
    "INSERT INTO regimen_episode (uuid, drug, dose, dose_unit, route, interval, start_epoch_day, updated_at) VALUES ('e1', 'estradiol', 4, 'mg', 'oral', 'daily', 100, 1000)"
  );
  db.raw.exec(
    "INSERT INTO regimen_episode (uuid, drug, dose, dose_unit, route, interval, start_epoch_day, updated_at) VALUES ('e2', 'spironolactone', 100, 'mg', 'oral', 'daily', 200, 1000)"
  );
  db.raw.exec(
    "INSERT INTO dose_event (uuid, timestamp, route, dose, dose_unit, status, updated_at) VALUES ('d1', 8640000000, 'oral', 4, 'mg', 'taken', 1000)"
  );

  /* Two episodes for different drugs may overlap on purpose, so nothing
     infers one episode's end from the next one's start: an end is the day
     the person ended it, or null. Writing e2's start does not close e1. */
  const episodes = (
    db.raw.prepare('SELECT uuid, end_epoch_day, end_reason FROM regimen_episode ORDER BY start_epoch_day').all() as Array<{
      uuid: string;
      end_epoch_day: number | null;
      end_reason: string | null;
    }>
  ).map((row) => ({ ...row }));
  assert.deepEqual(episodes, [
    { uuid: 'e1', end_epoch_day: null, end_reason: null },
    { uuid: 'e2', end_epoch_day: null, end_reason: null }
  ]);

  // A dose carries its own drug only once it needs one; unattributed is the
  // resting state, not a gap.
  const dose = db.raw.prepare('SELECT drug FROM dose_event WHERE uuid = ?').get('d1') as { drug: string | null };
  assert.equal(dose.drug, null);
});


test('v27 video_note is entry-only, ordered, and unique by uuid', async () => {
  const db = await migratedDb();
  const exec = (sql: string) => db.raw.exec(sql);
  exec("INSERT INTO entry (uuid, epoch_day, timestamp, note, updated_at) VALUES ('e1', 19180, 1000, '', 1000)");
  exec("INSERT INTO video_note (uuid, entry_id, file_path, updated_at) VALUES ('n1', 1, 'n1.webm', 1000)");

  // order_index defaults, the way voice_recording's does, so an insert that
  // does not name it still lands somewhere deterministic.
  const row = db.raw.prepare('SELECT * FROM video_note WHERE uuid = ?').get('n1') as {
    order_index: number;
    entry_id: number;
  };
  assert.equal(row.order_index, 0);
  assert.equal(row.entry_id, 1);

  assert.throws(() =>
    exec("INSERT INTO video_note (uuid, entry_id, file_path, updated_at) VALUES ('n1', 1, 'other.webm', 1000)")
  );
});










test('a milestone records where it came from in three nullable columns, all unset by default', async () => {
  const db = await migratedDb();
  db.raw.exec(
    "INSERT INTO milestone (uuid, name, epoch_day, updated_at) VALUES ('m-1', 'HRT Start', 20000, 0)"
  );

  const row = db.raw
    .prepare('SELECT uuid, name, roadmap_goal_key, procedure_id, tryout_id FROM milestone WHERE uuid = ?')
    .get('m-1') as {
    uuid: string;
    name: string;
    roadmap_goal_key: string | null;
    procedure_id: string | null;
    tryout_id: string | null;
  };
  assert.equal(row.uuid, 'm-1');
  assert.equal(row.name, 'HRT Start');
  // A milestone someone typed for themselves came from nowhere, which is a
  // resting state rather than three gaps (ADR-0045).
  assert.equal(row.roadmap_goal_key, null);
  assert.equal(row.procedure_id, null);
  assert.equal(row.tryout_id, null);
});

test('the presentation table and entry.presentation_id are both nullable and unfilled by default', async () => {
  const db = await migratedDb();
  db.raw.exec("INSERT INTO entry (uuid, epoch_day, timestamp, note, updated_at) VALUES ('e-1', 100, 1000, '', 1000)");

  const entryRow = db.raw.prepare("SELECT presentation_id FROM entry WHERE uuid = 'e-1'").get() as {
    presentation_id: string | null;
  };
  assert.equal(entryRow.presentation_id, null);

  db.raw.exec(
    "INSERT INTO presentation (uuid, name, role_index, updated_at) VALUES ('p-1', 'femme', 0, 1000)"
  );
  const presentationRow = db.raw.prepare("SELECT name, role_index, hidden FROM presentation WHERE uuid = 'p-1'").get() as {
    name: string;
    role_index: number;
    hidden: number;
  };
  assert.equal(presentationRow.name, 'femme');
  assert.equal(presentationRow.role_index, 0);
  assert.equal(presentationRow.hidden, 0);

  db.raw.exec("UPDATE entry SET presentation_id = 'p-1' WHERE uuid = 'e-1'");
  const linked = db.raw.prepare("SELECT presentation_id FROM entry WHERE uuid = 'e-1'").get() as {
    presentation_id: string | null;
  };
  assert.equal(linked.presentation_id, 'p-1');
});

test('v50 adds the era table, with both bounds nullable and no fifth column', async () => {
  const db = await migratedDb();

  db.raw.exec("INSERT INTO era (uuid, name, start_epoch_day, end_epoch_day, updated_at) VALUES ('era-1', 'before I knew', NULL, 19000, 1000)");
  const row = db.raw.prepare("SELECT name, start_epoch_day, end_epoch_day FROM era WHERE uuid = 'era-1'").get() as {
    name: string;
    start_epoch_day: number | null;
    end_epoch_day: number | null;
  };
  assert.equal(row.name, 'before I knew');
  assert.equal(row.start_epoch_day, null);
  assert.equal(row.end_epoch_day, 19000);

  db.raw.exec("INSERT INTO era (uuid, name, start_epoch_day, end_epoch_day, updated_at) VALUES ('era-2', 'now', 19001, NULL, 1000)");
  const running = db.raw.prepare("SELECT end_epoch_day FROM era WHERE uuid = 'era-2'").get() as {
    end_epoch_day: number | null;
  };
  assert.equal(running.end_epoch_day, null);

  /* ADR-0049: the table owns a name and two bounds and nothing else, so the
     column list is the assertion. A colour, a mute flag or a photo policy
     arriving here is the erosion the ADR exists to refuse, and it has to
     supersede the ADR rather than slip in past a test that only checked the
     four columns it knew about. */
  const columns = (db.raw.prepare('PRAGMA table_info(era)').all() as { name: string }[]).map((c) => c.name);
  assert.deepEqual(columns, ['id', 'uuid', 'name', 'start_epoch_day', 'end_epoch_day', 'updated_at']);
});

test('v51 adds era_mute, presence keyed by era_uuid alone', async () => {
  const db = await migratedDb();

  db.raw.exec("INSERT INTO era_mute (era_uuid, updated_at) VALUES ('era-1', 1000)");
  const row = db.raw.prepare("SELECT era_uuid FROM era_mute WHERE era_uuid = 'era-1'").get() as {
    era_uuid: string;
  };
  assert.equal(row.era_uuid, 'era-1');

  // No foreign key to era: a mute can be inserted for a uuid no era table
  // row names at all, the same free-text shape roadmap_check's pack_key has.
  db.raw.exec("INSERT INTO era_mute (era_uuid, updated_at) VALUES ('no-such-era', 1000)");
  assert.equal(
    (db.raw.prepare("SELECT era_uuid FROM era_mute WHERE era_uuid = 'no-such-era'").get() as { era_uuid: string })
      .era_uuid,
    'no-such-era'
  );

  const columns = (db.raw.prepare('PRAGMA table_info(era_mute)').all() as { name: string }[]).map((c) => c.name);
  assert.deepEqual(columns, ['id', 'era_uuid', 'updated_at']);
});

test('the three late benchmark columns are optional, and a take without them reads null', async () => {
  const db = await migratedDb();

  /* A benchmark whose extras were never captured - the frames a pitch graph
     would draw, the equipment the resonance figures depend on, the second
     vowel a scale factor is fitted against. None can be reconstructed after
     the fact, so each reads null forever and the surfaces that need it
     decline to draw or compare that take rather than assuming one
     (ADR-0059, ADR-0061). */
  db.raw.exec(`INSERT INTO voice_benchmark
    (uuid, epoch_day, timestamp, passage_key, passage_file_path, vowel_file_path,
     f0_median_hz, f0_p10_hz, f0_p90_hz, semitone_sd, words_per_minute,
     f1_hz, f2_hz, snr_db, note, updated_at)
    VALUES ('vb-bare', 20000, 1000, 'builtin', 'a.webm', NULL,
     180, 168, 205, 2.4, 140, 700, 1260, 24.5, NULL, 1000)`);

  const bare = db.raw
    .prepare("SELECT pitch_track, capture_chain, resonance_scale, f0_median_hz, f1_hz FROM voice_benchmark WHERE uuid = 'vb-bare'")
    .get() as {
    pitch_track: string | null;
    capture_chain: string | null;
    resonance_scale: number | null;
    f0_median_hz: number;
    f1_hz: number;
  };
  assert.equal(bare.pitch_track, null);
  assert.equal(bare.capture_chain, null);
  assert.equal(bare.resonance_scale, null);
  // The figures a bare take does keep are ordinary NOT NULL columns.
  assert.equal(bare.f0_median_hz, 180);
  assert.equal(bare.f1_hz, 700);

  const chain = 'Pixel 10a | Bottom microphone | ec=off ns=off agc=off';
  db.raw
    .prepare('UPDATE voice_benchmark SET pitch_track = ?, capture_chain = ?, resonance_scale = ? WHERE uuid = ?')
    .run('180.4,,176.2', chain, 0.94, 'vb-bare');
  const filled = db.raw
    .prepare("SELECT pitch_track, capture_chain, resonance_scale FROM voice_benchmark WHERE uuid = 'vb-bare'")
    .get() as { pitch_track: string; capture_chain: string; resonance_scale: number };
  assert.equal(filled.pitch_track, '180.4,,176.2');
  assert.equal(filled.capture_chain, chain);
  assert.equal(filled.resonance_scale, 0.94);
});

test('one appointment record, and a consult is the case of it that names a procedure', async () => {
  const db = await migratedDb();

  // There is no second table for a consult (ADR-0066): two tables for one
  // concept is what the glossary exists to refuse.
  assert.equal(
    db.raw.prepare("SELECT name FROM sqlite_master WHERE name = 'procedure_consult'").get(),
    undefined
  );

  db.raw.exec("INSERT INTO procedure (uuid, name, notes, updated_at) VALUES ('p-1', 'Vaginoplasty', '', 0)");
  const procedureId = (db.raw.prepare("SELECT id FROM procedure WHERE uuid = 'p-1'").get() as { id: number }).id;
  db.raw
    .prepare('INSERT INTO appointment (uuid, procedure_id, epoch_day, updated_at) VALUES (?, ?, ?, ?)')
    .run('c-1', procedureId, 20000, 0);

  const row = db.raw
    .prepare('SELECT uuid, procedure_id, epoch_day, kind, place, note FROM appointment WHERE uuid = ?')
    .get('c-1') as {
    uuid: string;
    procedure_id: number | null;
    epoch_day: number;
    kind: string | null;
    place: string | null;
    note: string | null;
  };
  assert.equal(row.procedure_id, procedureId);
  assert.equal(row.epoch_day, 20000);
  // Unfilled rather than defaulted: nothing ships a list of appointment kinds
  // in either language, so an unanswered one says nothing.
  assert.equal(row.kind, null);
  assert.equal(row.place, null);
  assert.equal(row.note, null);

  // Nothing has to name a procedure, which is the whole of the generalisation.
  db.raw
    .prepare('INSERT INTO appointment (uuid, epoch_day, kind, updated_at) VALUES (?, ?, ?, ?)')
    .run('a-1', 20010, 'endocrinologist', 0);
  const standalone = db.raw.prepare('SELECT procedure_id FROM appointment WHERE uuid = ?').get('a-1') as {
    procedure_id: number | null;
  };
  assert.equal(standalone.procedure_id, null);

  // And a procedure still takes its own appointments with it: the rebuilt
  // table keeps ON DELETE CASCADE on the link it made nullable.
  db.raw.exec("DELETE FROM procedure WHERE uuid = 'p-1'");
  const left = db.raw.prepare('SELECT COUNT(*) AS n FROM appointment').get() as { n: number };
  assert.equal(left.n, 1);
  const survivor = db.raw.prepare('SELECT uuid FROM appointment').get() as { uuid: string };
  assert.equal(survivor.uuid, 'a-1');
});

test('a document link is optional, and an unlinked one reads back with neither half set', async () => {
  const db = await migratedDb();

  db.raw.exec(
    "INSERT INTO document (uuid, epoch_day, title, file_path, updated_at) VALUES ('d-1', 20000, 'Referral', 'f.jpg', 0)"
  );

  const row = db.raw.prepare('SELECT target_kind, target_id FROM document WHERE uuid = ?').get('d-1') as {
    target_kind: string | null;
    target_id: string | null;
  };
  assert.equal(row.target_kind, null);
  assert.equal(row.target_id, null);

  // The pair, not just each column: one set without the other is refused
  // (ADR-0065's "at most one link", enforced by the schema).
  assert.throws(() =>
    db.raw
      .prepare("UPDATE document SET target_kind = 'milestone' WHERE uuid = 'd-1'")
      .run()
  );
  assert.throws(() => db.raw.prepare("UPDATE document SET target_id = 'm-1' WHERE uuid = 'd-1'").run());

  // A kind outside the closed four is refused too.
  assert.throws(() =>
    db.raw
      .prepare("UPDATE document SET target_kind = 'tryout', target_id = 't-1' WHERE uuid = 'd-1'")
      .run()
  );

  // Both together is the one write the CHECK allows.
  db.raw.exec("UPDATE document SET target_kind = 'milestone', target_id = 'm-1' WHERE uuid = 'd-1'");
  const linked = db.raw.prepare('SELECT target_kind, target_id FROM document WHERE uuid = ?').get('d-1') as {
    target_kind: string | null;
    target_id: string | null;
  };
  assert.equal(linked.target_kind, 'milestone');
  assert.equal(linked.target_id, 'm-1');
});

test('the hand-written latest version and the migration list agree', async () => {
  /* LATEST_SCHEMA_VERSION stopped being derived from the array in phase 5
     audit ticket 02, so that a boot on the current schema never loads it.
     Two places now write the number down, and this is what catches a
     migration appended without the constant moving - including the merge
     case, where two branches each add a version and the loser renumbers. */
  assert.equal(LATEST_SCHEMA_VERSION, Math.max(...migrations.map((migration) => migration.version)));

  /* Contiguous from the squashed baseline rather than from 1 (ticket 34): the
     versions below it were retired into one statement and no longer exist to
     be applied, so a gap there is the squash and a gap above it is a
     migration that went missing. */
  assert.deepEqual(
    migrations.map((migration) => migration.version),
    Array.from(
      { length: LATEST_SCHEMA_VERSION - SQUASH_BASELINE_VERSION + 1 },
      (_, index) => SQUASH_BASELINE_VERSION + index
    ),
    'the list is contiguous from the baseline, in order, with no version applied twice'
  );
});






test('every wear session has a kind, and a write that names none gets the default', async () => {
  const db = await migratedDb();

  /* NOT NULL because every user-facing string on that screen is picked by the
     kind (ADR-0064), so there is no wording to draw without one. The default
     is what a write that says nothing gets - and what the rows written before
     the column existed became. */
  db.raw.exec(`INSERT INTO wear_session (uuid, start_timestamp, duration_ms, note, updated_at)
    VALUES ('ws-old', 1700000000000, 21600000, 'a bit tight by the end', 1000)`);

  const row = db.raw.prepare("SELECT kind, note FROM wear_session WHERE uuid = 'ws-old'").get() as {
    kind: string;
    note: string;
  };
  assert.equal(row.kind, 'binder');
  assert.equal(row.note, 'a bit tight by the end');
});
