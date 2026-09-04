/* Verifies the schema DDL itself (ticket 02's acceptance criteria): it
   applies cleanly through the migration runner, the deltas from the PRD
   schema landed, and the cascades the PRD relies on actually cascade.
   Part of the Node tier (ticket 03); run with `npm test`. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { migratedDb, noopFileOps } from './test-support/migrated-db.ts';
import { runMigrations } from './migration-runner.ts';
import { migrations } from './migrations.ts';
import { LATEST_SCHEMA_VERSION } from './schema-version.ts';
import { makeNodeSqliteDb } from './test-support/node-sqlite-driver.ts';

test('applies cleanly to an empty database and sets user_version', async () => {
  const db = await migratedDb();
  // Deliberate oracle: the one hardcoded version in this suite, so a runner
  // bug that stalls user_version can't hide behind the derived constant.
  assert.equal(db.getUserVersion(), 58);

  const tables = db.raw
    .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name")
    .all()
    .map((r) => (r as { name: string }).name);

  for (const expected of [
    'affirmation',
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

test('v11 side_effect carries no episode reference and rejects severity outside 1-5', async () => {
  const db = await migratedDb();
  const columns = (db.raw.prepare('PRAGMA table_info(side_effect)').all() as Array<{ name: string }>).map(
    (c) => c.name
  );
  assert.ok(!columns.some((name) => name.includes('episode')), 'side_effect must not reference a regimen episode');

  assert.doesNotThrow(() =>
    db.raw.exec("INSERT INTO side_effect (uuid, name, severity, epoch_day, updated_at) VALUES ('s1', 'nausea', 1, 100, 1000)")
  );
  assert.throws(() =>
    db.raw.exec("INSERT INTO side_effect (uuid, name, severity, epoch_day, updated_at) VALUES ('s2', 'nausea', 0, 100, 1000)")
  );
  assert.throws(() =>
    db.raw.exec("INSERT INTO side_effect (uuid, name, severity, epoch_day, updated_at) VALUES ('s3', 'nausea', 6, 100, 1000)")
  );
});

test('v36 splits a body region into two axes, leaving every stored intensity as the dysphoria it was', async () => {
  const preV36 = migrations.filter((m) => m.version <= 35);
  const db = makeNodeSqliteDb();
  await runMigrations(db, noopFileOps(), preV36);
  db.raw.exec("INSERT INTO entry (uuid, epoch_day, timestamp, updated_at) VALUES ('e1', 100, 1000, 1000)");
  db.raw.exec("INSERT INTO entry_body_region (entry_id, region, intensity) VALUES (1, 'chest', 70)");
  db.raw.exec("INSERT INTO entry_body_region (entry_id, region, intensity) VALUES (1, 'hairline', 0)");

  await runMigrations(db, noopFileOps(), migrations);

  // What a person logged as distress is still distress, at the same number.
  // Nothing is reinterpreted, nothing is signed, and the new axis starts
  // empty rather than at zero - a 0 here would claim they said something.
  const rows = db.raw
    .prepare('SELECT region, dysphoria, euphoria FROM entry_body_region ORDER BY region')
    .all()
    // Rebuilt: node:sqlite hands back null-prototype rows, which deepEqual
    // will not match against a plain object literal.
    .map((r) => ({ ...(r as { region: string; dysphoria: number | null; euphoria: number | null }) }));
  assert.deepEqual(rows, [
    { region: 'chest', dysphoria: 70, euphoria: null },
    { region: 'hairline', dysphoria: 0, euphoria: null }
  ]);
});

test('v36 refuses a body region that says nothing on either axis', async () => {
  const db = await migratedDb();
  db.raw.exec("INSERT INTO entry (uuid, epoch_day, timestamp, updated_at) VALUES ('e1', 100, 1000, 1000)");

  assert.throws(() =>
    db.raw.exec("INSERT INTO entry_body_region (entry_id, region, dysphoria, euphoria) VALUES (1, 'chest', NULL, NULL)")
  );
});

test('v19 widens personal_effect to eight markers, preserving rows the v12 table already held', async () => {
  const preV19 = migrations.filter((m) => m.version <= 12);
  const db = makeNodeSqliteDb();
  await runMigrations(db, noopFileOps(), preV19);
  db.raw.exec(
    "INSERT INTO personal_effect (uuid, effect, first_noticed_epoch_day, updated_at) VALUES ('pe1', 'breast_development', 19180, 1000)"
  );

  await runMigrations(db, noopFileOps(), migrations);
  assert.equal(db.getUserVersion(), LATEST_SCHEMA_VERSION);

  const row = db.raw.prepare('SELECT * FROM personal_effect WHERE uuid = ?').get('pe1') as {
    effect: string;
    first_noticed_epoch_day: number;
    updated_at: number;
  };
  assert.deepEqual(row.effect, 'breast_development');
  assert.equal(row.first_noticed_epoch_day, 19180);
  assert.equal(row.updated_at, 1000);

  for (const effect of ['voice_drop', 'facial_body_hair', 'masculinizing_fat_redistribution', 'cycle_cessation']) {
    assert.doesNotThrow(() =>
      db.raw.exec(
        `INSERT INTO personal_effect (uuid, effect, first_noticed_epoch_day, updated_at) VALUES ('pe-${effect}', '${effect}', 100, 1000)`
      )
    );
  }
  // v19's own CHECK on the closed eight no longer holds once the full
  // migrations list runs - v37 drops it, the same way this test's sibling
  // below shows v34 dropping measurement.type's. See the v37 test.
});

test('v34 drops the CHECK on measurement.type, preserving rows the v5 table already held', async () => {
  const preV34 = migrations.filter((m) => m.version <= 5);
  const db = makeNodeSqliteDb();
  await runMigrations(db, noopFileOps(), preV34);
  db.raw.exec(
    "INSERT INTO measurement (uuid, epoch_day, type, value, unit, updated_at) VALUES ('m1', 19180, 'waist', 78, 'cm', 1000)"
  );

  await runMigrations(db, noopFileOps(), migrations);
  assert.equal(db.getUserVersion(), LATEST_SCHEMA_VERSION);

  const row = db.raw.prepare('SELECT * FROM measurement WHERE uuid = ?').get('m1') as {
    type: string;
    value: number;
    unit: string;
  };
  assert.deepEqual(row.type, 'waist');
  assert.equal(row.value, 78);
  assert.equal(row.unit, 'cm');

  // The CHECK is gone: a key that was never in the closed set - including
  // one shaped like a custom type's minted uuid - now inserts cleanly.
  assert.doesNotThrow(() =>
    db.raw.exec(
      "INSERT INTO measurement (uuid, epoch_day, type, value, unit, updated_at) VALUES ('m2', 19180, 'a1b2c3d4-uuid', 30, 'cm', 1000)"
    )
  );
});

test('v39 drops the CHECK on personal_effect.effect and adds effect_category/personal_effect_type, preserving rows the v19 table already held', async () => {
  const preV39 = migrations.filter((m) => m.version <= 19);
  const db = makeNodeSqliteDb();
  await runMigrations(db, noopFileOps(), preV39);
  db.raw.exec(
    "INSERT INTO personal_effect (uuid, effect, first_noticed_epoch_day, updated_at) VALUES ('pe1', 'breast_development', 19180, 1000)"
  );

  await runMigrations(db, noopFileOps(), migrations);
  assert.equal(db.getUserVersion(), LATEST_SCHEMA_VERSION);

  const row = db.raw.prepare('SELECT * FROM personal_effect WHERE uuid = ?').get('pe1') as {
    effect: string;
    first_noticed_epoch_day: number;
    updated_at: number;
  };
  assert.deepEqual(row.effect, 'breast_development');
  assert.equal(row.first_noticed_epoch_day, 19180);
  assert.equal(row.updated_at, 1000);

  // The CHECK is gone: a key outside the old eight - including one shaped
  // like a custom effect type's minted uuid - now inserts cleanly.
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

test('v37 carries the v13 table across as Norwood-Hamilton stagings', async () => {
  const preV37 = migrations.filter((m) => m.version <= 13);
  const db = makeNodeSqliteDb();
  await runMigrations(db, noopFileOps(), preV37);
  db.raw.exec("INSERT INTO hair_stage (uuid, epoch_day, stage, updated_at) VALUES ('h1', 19180, '3a', 1000)");

  await runMigrations(db, noopFileOps(), migrations);
  assert.equal(db.getUserVersion(), LATEST_SCHEMA_VERSION);

  const row = db.raw.prepare('SELECT * FROM hair_stage WHERE uuid = ?').get('h1') as {
    epoch_day: number;
    scale: string;
    stage: string;
    description: string;
    updated_at: number;
  };
  // Norwood-Hamilton was the only vocabulary there was, so every row that
  // predates this migration is one, and its stage goes on meaning what it
  // meant.
  assert.equal(row.scale, 'norwood_hamilton');
  assert.equal(row.stage, '3a');
  assert.equal(row.description, '');
  assert.equal(row.epoch_day, 19180);
  assert.equal(row.updated_at, 1000);
});

test('v38 carries the v8 dose_schedule table across as everyNDays, with no weekday or amount rows', async () => {
  const preV38 = migrations.filter((m) => m.version <= 8);
  const db = makeNodeSqliteDb();
  await runMigrations(db, noopFileOps(), preV38);
  db.raw.exec(
    "INSERT INTO regimen_episode (uuid, drug, dose, dose_unit, route, interval, start_epoch_day, updated_at) VALUES ('e1', 'estradiol valerate', 4, 'mg', 'im', 'every 2 weeks', 19000, 1000)"
  );
  db.raw.exec(
    "INSERT INTO dose_schedule (uuid, episode_id, every_n_days, doses_per_day, updated_at) VALUES ('s1', 1, 14, 1, 1000)"
  );

  await runMigrations(db, noopFileOps(), migrations);
  assert.equal(db.getUserVersion(), LATEST_SCHEMA_VERSION);

  const row = db.raw.prepare('SELECT * FROM dose_schedule WHERE uuid = ?').get('s1') as {
    recurrence_kind: string;
    every_n_days: number;
    doses_per_day: number;
    updated_at: number;
  };
  // Every-N-days was the only shape there was, so a row that predates this
  // migration keeps meaning exactly what it meant - no reinterpreting, and
  // nothing invents a weekday or a dose amount it never had.
  assert.equal(row.recurrence_kind, 'everyNDays');
  assert.equal(row.every_n_days, 14);
  assert.equal(row.doses_per_day, 1);
  assert.equal(row.updated_at, 1000);
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

test('v40 backfills end_epoch_day from the pre-v40 next-episode inference, and adds dose_event.drug as null', async () => {
  const preV40 = migrations.filter((m) => m.version <= 39);
  const db = makeNodeSqliteDb();
  await runMigrations(db, noopFileOps(), preV40);
  // A switch history exactly like the ticket's own motivating case:
  // estradiol from day 100, spironolactone added on day 200 - which, under
  // the pre-v40 model, ended the estradiol episode the day before.
  db.raw.exec(
    "INSERT INTO regimen_episode (uuid, drug, dose, dose_unit, route, interval, start_epoch_day, updated_at) VALUES ('e1', 'estradiol', 4, 'mg', 'oral', 'daily', 100, 1000)"
  );
  db.raw.exec(
    "INSERT INTO regimen_episode (uuid, drug, dose, dose_unit, route, interval, start_epoch_day, updated_at) VALUES ('e2', 'spironolactone', 100, 'mg', 'oral', 'daily', 200, 1000)"
  );
  db.raw.exec(
    "INSERT INTO dose_event (uuid, timestamp, route, dose, dose_unit, status, updated_at) VALUES ('d1', 8640000000, 'oral', 4, 'mg', 'taken', 1000)"
  );

  await runMigrations(db, noopFileOps(), migrations);
  assert.equal(db.getUserVersion(), LATEST_SCHEMA_VERSION);

  const episodes = (
    db.raw.prepare('SELECT uuid, end_epoch_day FROM regimen_episode ORDER BY start_epoch_day').all() as Array<{
      uuid: string;
      end_epoch_day: number | null;
    }>
  ).map((row) => ({ uuid: row.uuid, end_epoch_day: row.end_epoch_day }));
  assert.deepEqual(episodes, [
    { uuid: 'e1', end_epoch_day: 199 },
    { uuid: 'e2', end_epoch_day: null }
  ]);

  const dose = db.raw.prepare('SELECT drug FROM dose_event WHERE uuid = ?').get('d1') as { drug: string | null };
  assert.equal(dose.drug, null);
});

test('v41 drops doubt_entry and every row it held, leaving doubt_snapshot and its items untouched', async () => {
  const preV41 = migrations.filter((m) => m.version <= 40);
  const db = makeNodeSqliteDb();
  await runMigrations(db, noopFileOps(), preV41);
  db.raw.exec(
    "INSERT INTO doubt_entry (uuid, epoch_day, timestamp, text, updated_at) VALUES ('d1', 20000, 1000, 'am I even trans enough for this', 1000)"
  );
  db.raw.exec("INSERT INTO doubt_snapshot (uuid, epoch_day, timestamp, updated_at) VALUES ('s1', 20000, 1000, 1000)");
  db.raw.exec(
    "INSERT INTO doubt_snapshot_entry (snapshot_id, order_index, epoch_day, mood, note) VALUES (1, 0, 19500, 5, 'euphoric at the appointment')"
  );

  await runMigrations(db, noopFileOps(), migrations);
  assert.equal(db.getUserVersion(), LATEST_SCHEMA_VERSION);

  const tables = db.raw
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'doubt%'")
    .all()
    .map((r) => (r as { name: string }).name);
  assert.deepEqual(tables.sort(), ['doubt_snapshot', 'doubt_snapshot_entry']);

  const snapshot = db.raw.prepare('SELECT uuid, epoch_day FROM doubt_snapshot WHERE uuid = ?').get('s1') as
    | { uuid: string; epoch_day: number }
    | undefined;
  assert.equal(snapshot?.uuid, 's1');
  assert.equal(snapshot?.epoch_day, 20000);
  const item = db.raw.prepare('SELECT note FROM doubt_snapshot_entry WHERE snapshot_id = 1').get() as
    | { note: string }
    | undefined;
  assert.equal(item?.note, 'euphoric at the appointment');
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

/* Ticket 35 replaced the `activePreset` preference with `activeScales`, the
   list of dimension keys the preset used to stand for. The three tests below
   are the whole of that translation: a built-in preset, a custom one, and an
   install that never wrote the preference at all. */

/** The rows a v41 database would hold for one preset - the shape reconcile
    seeds for a built-in and dimensions.ts writes for a custom one. */
function seedPreset(
  db: Awaited<ReturnType<typeof migratedDb>>,
  preset: { key?: string; uuid?: string; dims: string[] }
) {
  const exec = (sql: string) => db.raw.exec(sql);
  for (const [i, dim] of preset.dims.entries()) {
    exec(
      `INSERT OR IGNORE INTO gender_dimension (key, name, low_label, high_label, min_value, max_value, is_built_in, updated_at)
       VALUES ('${dim}', '', '', '', 0, 100, 1, 1000)`
    );
    if (i === 0) {
      exec(
        `INSERT INTO gender_preset (uuid, key, name, is_built_in, updated_at)
         VALUES (${preset.uuid ? `'${preset.uuid}'` : 'NULL'}, ${preset.key ? `'${preset.key}'` : 'NULL'}, '', ${preset.key ? 1 : 0}, 1000)`
      );
    }
    exec(
      `INSERT INTO preset_dimension (preset_id, dimension_id, order_index)
       SELECT gp.id, gd.id, ${i} FROM gender_preset gp, gender_dimension gd
       WHERE gd.key = '${dim}' AND COALESCE(gp.key, gp.uuid) = '${preset.key ?? preset.uuid}'`
    );
  }
}

async function migratedToV41() {
  const db = makeNodeSqliteDb();
  await runMigrations(
    db,
    noopFileOps(),
    migrations.filter((m) => m.version <= 41)
  );
  return db;
}

function activeScales(db: Awaited<ReturnType<typeof migratedDb>>): string[] | null {
  const row = db.raw.prepare("SELECT value FROM pref WHERE key = 'activeScales'").get() as
    | { value: string }
    | undefined;
  return row ? (JSON.parse(row.value) as string[]) : null;
}

test('v42 turns a built-in preset into the list of scales it stood for', async () => {
  const db = await migratedToV41();
  seedPreset(db, { key: 'p-fem-masc', dims: ['euphoria_dysphoria', 'femininity', 'masculinity'] });
  db.raw.exec(`INSERT INTO pref (key, value) VALUES ('activePreset', '"p-fem-masc"')`);

  await runMigrations(db, noopFileOps(), migrations);

  // Sorted, because the order group_concat lands them in is not part of the
  // contract - nothing reads the stored order, and the editor draws its
  // sliders in catalogue order.
  assert.deepEqual(activeScales(db)?.sort(), ['euphoria_dysphoria', 'femininity', 'masculinity']);
  // The value has been read and translated, so the row is not left behind
  // for a build that no longer has a key for it.
  assert.equal(db.raw.prepare("SELECT value FROM pref WHERE key = 'activePreset'").get(), undefined);
});

test('v42 translates a custom preset by its uuid, not only the built-in keys', async () => {
  const db = await migratedToV41();
  seedPreset(db, { uuid: 'custom-1', dims: ['euphoria_dysphoria', 'agender_gendered'] });
  db.raw.exec(`INSERT INTO pref (key, value) VALUES ('activePreset', '"custom-1"')`);

  await runMigrations(db, noopFileOps(), migrations);

  assert.deepEqual(activeScales(db)?.sort(), ['agender_gendered', 'euphoria_dysphoria']);
});

test('v42 leaves an install that never chose a preset on the default set', async () => {
  const db = await migratedToV41();
  seedPreset(db, { key: 'p-fem-masc', dims: ['euphoria_dysphoria', 'femininity'] });

  await runMigrations(db, noopFileOps(), migrations);

  // No row rather than an empty list: an empty list is a person who unticked
  // everything, and this install has said nothing at all, so the preference
  assert.equal(activeScales(db), null);
});

async function migratedToV42() {
  const db = makeNodeSqliteDb();
  await runMigrations(
    db,
    noopFileOps(),
    migrations.filter((m) => m.version <= 42)
  );
  return db;
}

test('v43 adds roadmap_goal_key column to milestone table', async () => {
  const db = await migratedToV42();
  const beforeCols = await db.query<{ name: string }>('PRAGMA table_info(milestone)');
  assert.equal(beforeCols.some((c) => c.name === 'roadmap_goal_key'), false);

  await runMigrations(db, noopFileOps(), migrations);

  const afterCols = await db.query<{ name: string }>('PRAGMA table_info(milestone)');
  assert.equal(afterCols.some((c) => c.name === 'roadmap_goal_key'), true);
});

test('v44 adds procedure_id to milestone table, preserving existing milestones', async () => {
  const db = makeNodeSqliteDb();
  await runMigrations(
    db,
    noopFileOps(),
    migrations.filter((m) => m.version <= 43)
  );

  db.raw.exec(
    "INSERT INTO milestone (uuid, name, epoch_day, updated_at) VALUES ('m-1', 'HRT Start', 20000, 0)"
  );

  await runMigrations(db, noopFileOps(), migrations);
  assert.equal(db.getUserVersion(), LATEST_SCHEMA_VERSION);

  const row = db.raw.prepare('SELECT uuid, name, procedure_id FROM milestone WHERE uuid = ?').get('m-1') as {
    uuid: string;
    name: string;
    procedure_id: string | null;
  };
  assert.equal(row.uuid, 'm-1');
  assert.equal(row.name, 'HRT Start');
  assert.equal(row.procedure_id, null);
});

test('v47 adds tryout_id to milestone table, preserving existing milestones', async () => {
  const db = makeNodeSqliteDb();
  await runMigrations(
    db,
    noopFileOps(),
    migrations.filter((m) => m.version <= 46)
  );

  db.raw.exec("INSERT INTO milestone (uuid, name, epoch_day, updated_at) VALUES ('m-1', 'HRT Start', 20000, 0)");

  await runMigrations(db, noopFileOps(), migrations);
  assert.equal(db.getUserVersion(), LATEST_SCHEMA_VERSION);

  const row = db.raw.prepare('SELECT uuid, name, tryout_id FROM milestone WHERE uuid = ?').get('m-1') as {
    uuid: string;
    name: string;
    tryout_id: string | null;
  };
  assert.equal(row.uuid, 'm-1');
  assert.equal(row.name, 'HRT Start');
  assert.equal(row.tryout_id, null);
});

test('v49 adds the presentation table and entry.presentation_id, both nullable/unfilled by default', async () => {
  const db = makeNodeSqliteDb();
  await runMigrations(
    db,
    noopFileOps(),
    migrations.filter((m) => m.version <= 48)
  );

  db.raw.exec("INSERT INTO entry (uuid, epoch_day, timestamp, note, updated_at) VALUES ('e-1', 100, 1000, '', 1000)");

  await runMigrations(db, noopFileOps(), migrations);
  assert.equal(db.getUserVersion(), LATEST_SCHEMA_VERSION);

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
  const db = makeNodeSqliteDb();
  await runMigrations(
    db,
    noopFileOps(),
    migrations.filter((m) => m.version <= 49)
  );

  await runMigrations(db, noopFileOps(), migrations);
  assert.equal(db.getUserVersion(), LATEST_SCHEMA_VERSION);

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
  const db = makeNodeSqliteDb();
  await runMigrations(
    db,
    noopFileOps(),
    migrations.filter((m) => m.version <= 50)
  );

  await runMigrations(db, noopFileOps(), migrations);
  assert.equal(db.getUserVersion(), LATEST_SCHEMA_VERSION);

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

test('v58 adds the pitch track column, and a benchmark from before it has none', async () => {
  const db = makeNodeSqliteDb();
  await runMigrations(
    db,
    noopFileOps(),
    migrations.filter((m) => m.version <= 57)
  );

  /* A benchmark recorded before the column existed. The point of writing it
     at v57 rather than after the upgrade is that this is the only state the
     screen cannot produce for itself: the frames it would draw were thrown
     away, so `pitch_track` reads null and the take is undrawable forever
     (ticket 09, ADR-0059). */
  db.raw.exec(`INSERT INTO voice_benchmark
    (uuid, epoch_day, timestamp, passage_key, passage_file_path, vowel_file_path,
     f0_median_hz, f0_p10_hz, f0_p90_hz, semitone_sd, words_per_minute,
     f1_hz, f2_hz, snr_db, note, updated_at)
    VALUES ('vb-old', 20000, 1000, 'builtin', 'a.webm', NULL,
     180, 168, 205, 2.4, 140, NULL, NULL, NULL, NULL, 1000)`);

  await runMigrations(db, noopFileOps(), migrations);
  assert.equal(db.getUserVersion(), LATEST_SCHEMA_VERSION);

  const row = db.raw
    .prepare("SELECT pitch_track, f0_median_hz FROM voice_benchmark WHERE uuid = 'vb-old'")
    .get() as { pitch_track: string | null; f0_median_hz: number };
  assert.equal(row.pitch_track, null);
  // The figures the old row did keep are untouched by the upgrade.
  assert.equal(row.f0_median_hz, 180);

  db.raw.exec("UPDATE voice_benchmark SET pitch_track = '180.4,,176.2' WHERE uuid = 'vb-old'");
  assert.equal(
    (
      db.raw.prepare("SELECT pitch_track FROM voice_benchmark WHERE uuid = 'vb-old'").get() as {
        pitch_track: string;
      }
    ).pitch_track,
    '180.4,,176.2'
  );
});

test('the hand-written latest version and the migration list agree', async () => {
  /* LATEST_SCHEMA_VERSION stopped being derived from the array in phase 5
     audit ticket 02, so that a boot on the current schema never loads it.
     Two places now write the number down, and this is what catches a
     migration appended without the constant moving - including the merge
     case, where two branches each add a version and the loser renumbers. */
  assert.equal(LATEST_SCHEMA_VERSION, Math.max(...migrations.map((migration) => migration.version)));
  assert.deepEqual(
    migrations.map((migration) => migration.version),
    Array.from({ length: LATEST_SCHEMA_VERSION }, (_, index) => index + 1),
    'the list is contiguous from 1, in order, with no version applied twice'
  );
});

/* Ticket 53 retires the app-lock PIN gate, as v45. The acceptance criterion is about
   what an upgrading installation keeps rather than about what goes: the PIN
   was never the encryption credential (ADR-0014), so dropping it must leave
   the journal's real protection exactly where it was. */

/* main already defines migratedToV41 and migratedToV42 for its own
   migrations, so this is the same shape one pair of versions further on -
   and it has to be, or the two tests below would be exercising 43 and 44
   rather than 45. */
async function migratedToV44() {
  const db = makeNodeSqliteDb();
  await runMigrations(
    db,
    noopFileOps(),
    migrations.filter((m) => m.version <= 44)
  );
  return db;
}

const pref = (db: Awaited<ReturnType<typeof migratedDb>>, key: string): string | undefined =>
  (db.raw.prepare('SELECT value FROM pref WHERE key = ?').get(key) as { value: string } | undefined)?.value;

test('v45 takes the retired PIN gate\'s preferences and leaves everything else alone', async () => {
  const db = await migratedToV44();
  db.raw.exec(`INSERT INTO pref (key, value) VALUES ('pinHash', '"v1$8192$1$1$32$c2FsdA==$aGFzaA=="')`);
  db.raw.exec(`INSERT INTO pref (key, value) VALUES ('appLock', 'true')`);
  /* The two mid-session triggers outlive the gate: they now re-ask whatever
     secret the access mode has (ADR-0041), so they are not the PIN's. */
  db.raw.exec(`INSERT INTO pref (key, value) VALUES ('lockOnLeave', 'true')`);
  db.raw.exec(`INSERT INTO pref (key, value) VALUES ('quickExit', 'true')`);
  db.raw.exec(`INSERT INTO pref (key, value) VALUES ('name', '"Alicja"')`);

  await runMigrations(db, noopFileOps(), migrations);

  // A PIN hash is credential material, and it does not outlive its gate.
  assert.equal(pref(db, 'pinHash'), undefined);
  assert.equal(pref(db, 'appLock'), undefined);
  assert.equal(pref(db, 'lockOnLeave'), 'true');
  assert.equal(pref(db, 'quickExit'), 'true');
  assert.equal(pref(db, 'name'), '"Alicja"');
});

test('v45 is a no-op for an installation that never set a PIN', async () => {
  const db = await migratedToV44();
  db.raw.exec(`INSERT INTO pref (key, value) VALUES ('name', '"Alicja"')`);

  await runMigrations(db, noopFileOps(), migrations);

  assert.equal(pref(db, 'pinHash'), undefined);
  assert.equal(pref(db, 'name'), '"Alicja"');
  assert.equal(db.getUserVersion(), LATEST_SCHEMA_VERSION);
});
