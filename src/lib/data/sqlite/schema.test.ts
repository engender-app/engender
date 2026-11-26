/* Verifies the schema DDL itself (ticket 02's acceptance criteria): it
   applies cleanly through the migration runner, the deltas from the PRD
   schema landed, and the cascades the PRD relies on actually cascade.
   Part of the Node tier (ticket 03); run with `npm test`. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migratedDb, noopFileOps } from './test-support/migrated-db.ts';
import { JournalBelowBaselineError, runMigrations, SchemaTooNewError } from './migration-runner.ts';
import { migrations, POST_RC1_STEPS } from './migrations.ts';
import { LATEST_SCHEMA_VERSION } from './schema-version.ts';
import { makeNodeSqliteDb } from './test-support/node-sqlite-driver.ts';
import { preSquashChain } from './test-support/pre-squash-chain.ts';
import { dumpRows, dumpSchema, readSchemaFixture } from './test-support/schema-dump.ts';

/* The version the second squash landed on (after-release ticket 42): one
   baseline statement in place of the v78 baseline and the ten steps after it,
   keeping the number those steps had reached so a journal already on the
   current schema opens without anything running against it. Hardcoded rather
   than read off LATEST_SCHEMA_VERSION, which moves on as migrations are added
   after it. */
const SQUASH_BASELINE_VERSION = 88;

/* The step pre-publish ticket 01 folded 89 to 119 into, numbered where that
   chain had reached. */
const POST_RC1_SQUASH_VERSION = 119;

const fixture = (name: string) =>
  readSchemaFixture(readFileSync(new URL(`./test-support/${name}`, import.meta.url), 'utf8'));

/* The one row the retired chain left that the baseline does not write:
   v83's INSERT ... SELECT into the rebuilt taper table created taper's
   AUTOINCREMENT counter at 0 even when it copied nothing. */
const CHAIN_ONLY_SEQUENCE_ROW = '  {"name":"taper","seq":0}\n';

/* The frozen comparisons hold the baseline alone to the reference, so a
   forward migration appended later moves the live schema and not them. */
const upToBaseline = migrations.filter((m) => m.version <= SQUASH_BASELINE_VERSION);

/** SQLite's schema cookie, which any DDL bumps even when it undoes itself. */
const schemaCookie = (db: { raw: { prepare(sql: string): { get(): unknown } } }) =>
  (db.raw.prepare('PRAGMA schema_version').get() as { schema_version: number }).schema_version;

test('the v88 baseline builds the schema the chain up to 88 built', async () => {
  /* The ground truth is a dump taken from a database the real chain (the v78
     baseline plus 79 through 88) built, frozen before this squash touched it.
     The chain is in git history from there, not in the tree, so the fixture is
     the only thing left that remembers what it produced; its header says
     which commit holds the chain and how to rebuild the dump.

     Compared through dumpSchema, which forgives comments, whitespace and the
     quoting ALTER TABLE leaves behind, so the baseline is free to be written
     as a readable column list rather than as the appended-column text SQLite
     happened to store. Everything else - every table, column, type, default,
     CHECK, foreign key, index, trigger, and the FTS5 table with its shadow
     tables - has to match. */
  const db = makeNodeSqliteDb();
  await runMigrations(db, noopFileOps(), upToBaseline);

  assert.equal(db.getUserVersion(), SQUASH_BASELINE_VERSION);
  assert.equal(dumpSchema(db.raw) + '\n', fixture('schema-v88-reference.txt'));
});

test('the v88 baseline leaves the rows the chain left, but for one equivalent counter', async () => {
  /* Seed data, proven apart from the schema. Neither writes rows of its own;
     what both leave is FTS5's config and structure records, which must match
     byte for byte. */
  const db = makeNodeSqliteDb();
  await runMigrations(db, noopFileOps(), upToBaseline);

  const reference = fixture('schema-v88-reference-rows.txt');
  assert.ok(reference.includes(CHAIN_ONLY_SEQUENCE_ROW));
  assert.equal(dumpRows(db.raw) + '\n', reference.replace(CHAIN_ONLY_SEQUENCE_ROW, ''));

  /* A counter at 0 and no counter hand out the same first id, so the missing
     row changes nothing a journal can observe. */
  const withCounter = makeNodeSqliteDb();
  await runMigrations(withCounter, noopFileOps(), upToBaseline);
  withCounter.raw.exec("INSERT INTO sqlite_sequence (name, seq) VALUES ('taper', 0)");
  for (const journal of [db, withCounter]) {
    journal.raw.exec(`INSERT INTO procedure (uuid, name, notes, kind, updated_at) VALUES ('p', 'v', '', 'vaginoplasty', 1)`);
    journal.raw.exec(`INSERT INTO taper (uuid, procedure_id, start_epoch_day, stages, updated_at) VALUES ('t', 1, 1, '[]', 1)`);
    assert.equal((journal.raw.prepare("SELECT id FROM taper WHERE uuid = 't'").get() as { id: number }).id, 1);
  }
});

/** A spy over the pre-migration copy hooks, for the boundary tests below. */
function copySpy(copyAlreadyThere = false) {
  const calls = { copies: 0, cleanups: 0, restores: 0 };
  return {
    calls,
    fileOps: {
      preMigrationCopyIsUsable: () => copyAlreadyThere,
      copyDatabaseFile: () => {
        calls.copies += 1;
      },
      restorePreMigrationCopy: () => {
        calls.restores += 1;
      },
      cleanupPreMigrationCopy: () => {
        calls.cleanups += 1;
      }
    }
  };
}

/** A journal with the current schema and something written in it, then
    renumbered: what a development build's journal from partway up the
    retired chain looks like to the runner, rows and all. */
async function journalNumbered(version: number) {
  const db = await migratedDb();
  db.raw.exec("INSERT INTO entry (uuid, epoch_day, timestamp, note, updated_at) VALUES ('e1', 100, 1000, 'still here', 1000)");
  db.setUserVersion(version);
  return db;
}

test.each([1, 78, SQUASH_BASELINE_VERSION - 1])(
  'a journal at %i, below the baseline, is refused loudly with its rows and its copy left alone',
  async (version) => {
    /* The price the squash took: the steps that would have carried such a
       journal forward are gone, so it cannot be opened. What it must not do is
       go wrong quietly, or as a SQLite message: the version is behind rather
       than ahead, and the runner says so by name (after-release ticket 09), so
       the failure screen can tell the person where the journal came from
       instead of printing "table entry already exists". 87 is the boundary:
       one step short of the baseline is as unsupported as 1. */
    const db = await journalNumbered(version);
    const before = dumpRows(db.raw);
    const schemaBefore = dumpSchema(db.raw);
    const cookieBefore = schemaCookie(db);
    // A copy from an earlier failed boot is beside it, which must survive too.
    const { calls, fileOps } = copySpy(true);

    await assert.rejects(
      () => runMigrations(db, fileOps, migrations),
      (error: unknown) =>
        error instanceof JournalBelowBaselineError &&
        error.foundVersion === version &&
        error.baselineVersion === SQUASH_BASELINE_VERSION
    );

    // Refused before anything runs. No copy is taken, because nothing is
    // about to change, and the one already there is neither restored nor
    // retired (ADR-0006, amended by ticket 04).
    assert.deepEqual(calls, { copies: 0, cleanups: 0, restores: 0 });
    assert.equal(db.getUserVersion(), version);
    assert.equal(dumpRows(db.raw), before);
    assert.equal(dumpSchema(db.raw), schemaBefore);
    // Not even a table created and dropped again on the way to the refusal.
    assert.equal(schemaCookie(db), cookieBefore);
  }
);

test('a journal newer than this build is refused with its rows and its copy left alone', async () => {
  const db = await journalNumbered(LATEST_SCHEMA_VERSION + 1);
  const before = dumpRows(db.raw);
  const cookieBefore = schemaCookie(db);
  const { calls, fileOps } = copySpy(true);

  await assert.rejects(
    () => runMigrations(db, fileOps, migrations),
    (error: unknown) =>
      error instanceof SchemaTooNewError &&
      error.foundVersion === LATEST_SCHEMA_VERSION + 1 &&
      error.knownVersion === LATEST_SCHEMA_VERSION
  );

  assert.deepEqual(calls, { copies: 0, cleanups: 0, restores: 0 });
  assert.equal(db.getUserVersion(), LATEST_SCHEMA_VERSION + 1);
  assert.equal(dumpRows(db.raw), before);
  assert.equal(schemaCookie(db), cookieBefore);
});

test('a populated journal already on the latest schema reopens unchanged, without the baseline running again', async () => {
  /* What every journal on the current schema does at boot. The lazy source is
     what boot hands over, and a load here would mean the runner meant to
     apply something. */
  const db = await journalNumbered(LATEST_SCHEMA_VERSION);
  const before = dumpRows(db.raw);
  const schemaBefore = dumpSchema(db.raw);
  const { calls, fileOps } = copySpy();

  await runMigrations(db, fileOps, {
    latestVersion: LATEST_SCHEMA_VERSION,
    load: async () => {
      throw new Error('the migration list was loaded for a journal already on the current schema');
    }
  });
  // And the plain array, which a test or a probe hands over.
  await runMigrations(db, fileOps, migrations);

  assert.equal(db.getUserVersion(), LATEST_SCHEMA_VERSION);
  assert.equal(dumpRows(db.raw), before);
  assert.equal(dumpSchema(db.raw), schemaBefore);
  // Two clean boots, so whatever copy was left is retired, and none is taken.
  assert.deepEqual(calls, { copies: 0, cleanups: 2, restores: 0 });
});

test('the squash left one migration standing up to 88, the baseline itself', async () => {
  assert.deepEqual(
    upToBaseline.map((m) => ({ version: m.version, baseline: m.baseline })),
    [{ version: SQUASH_BASELINE_VERSION, baseline: true }]
  );
});

test('applies cleanly to an empty database and sets user_version', async () => {
  const db = await migratedDb();
  // Deliberate oracle: the one hardcoded version in this suite, so a runner
  // bug that stalls user_version can't hide behind the derived constant.
  assert.equal(db.getUserVersion(), 123);

  const tables = db.raw
    .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name")
    .all()
    .map((r) => (r as { name: string }).name);

  for (const expected of [
    'appointment',
    'appointment_status',
    'area_state',
    'comfort_item',
    'cycle_event',
    'deletion',
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
    'medication_stock',
    'milestone',
    'effect_category',
    'personal_effect',
    'personal_effect_type',
    'photo',
    'presentation',
    'progress_photo',
    'provider',
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

test('affirmation and revisit tables are removed from migrated journals', async () => {
  const db = await migratedDb();
  const tables = db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()
    .map((row) => (row as { name: string }).name);
  assert.ok(!tables.includes('affirmation'));
  assert.ok(!tables.includes('revisit'));
  assert.ok(tables.includes('letter'));
  await db.close();
});

test('the journaling pause table is gone from migrated journals', async () => {
  const db = await migratedDb();
  const tables = db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()
    .map((row) => (row as { name: string }).name);
  assert.ok(!tables.includes('journaling_pause'));
  assert.ok(tables.includes('dose_pause'));
  await db.close();
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

test('the index deletes a row without being handed its old text', async () => {
  // Why this option, rather than the 'delete' command a plain contentless
  // table forces, is in schema.ts above entry_fts.
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

test('an entry drops out of the index when the entry row goes', async () => {
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

test('gender_dimension.hidden defaults to visible', async () => {
  const db = await migratedDb();
  db.raw.exec(
    "INSERT INTO gender_dimension (key, name, low_label, high_label, updated_at) VALUES ('voice', 'Voice', 'low', 'high', 1000)"
  );
  const row = db.raw.prepare("SELECT hidden FROM gender_dimension WHERE key = 'voice'").get() as {
    hidden: number;
  };
  assert.equal(row.hidden, 0);
});

test('entry.starred and photo.starred default to unstarred', async () => {
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
  for (const table of ['entry', 'photo', 'milestone', 'lab_result', 'side_effect', 'reminder', 'cycle_event']) {
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
      "INSERT INTO reminder (uuid, title, time, epoch_day, updated_at) VALUES ('r1', 'Appt', '09:00', 100, 1000)"
    )
  );
  assert.doesNotThrow(() =>
    insert(
      "INSERT INTO reminder (uuid, title, time, recurrence, updated_at) VALUES ('r2', 'Pill', '20:00', 'DAILY', 1000)"
    )
  );
  assert.doesNotThrow(() =>
    insert(
      "INSERT INTO reminder (uuid, title, time, recurrence, interval, anchor_epoch_day, updated_at) VALUES ('r3', 'Patch', '20:00', 'EVERY_N_DAYS', 3, 50, 1000)"
    )
  );
  // Recurring but missing interval/anchor.
  assert.throws(() =>
    insert(
      "INSERT INTO reminder (uuid, title, time, recurrence, updated_at) VALUES ('r4', 'Patch', '20:00', 'EVERY_N_DAYS', 1000)"
    )
  );
  // Neither a recurrence nor a one-off day.
  assert.throws(() =>
    insert("INSERT INTO reminder (uuid, title, time, updated_at) VALUES ('r5', 'Nothing', '20:00', 1000)")
  );
});

test('tally_event.kind takes both counters; the vocabulary is the code\'s (FA 04)', async () => {
  const db = await migratedDb();
  const insert = (kind: string) =>
    db.raw.exec(`INSERT INTO tally_event (uuid, epoch_day, kind, updated_at) VALUES ('t-${kind}', 100, '${kind}', 1000)`);

  assert.doesNotThrow(() => insert('misgendered'));
  assert.doesNotThrow(() => insert('correctly_gendered'));
});

test('cycle_event carries no episode reference and takes its three kinds', async () => {
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

test('a body region holds one value on the shared 0-100 scale (ticket 39)', async () => {
  const db = await migratedDb();
  db.raw.exec("INSERT INTO entry (uuid, epoch_day, timestamp, updated_at) VALUES ('e1', 100, 1000, 1000)");

  db.raw.exec("INSERT INTO entry_body_region (entry_id, region, value) VALUES (1, 'chest', 15)");
  db.raw.exec("INSERT INTO entry_body_region (entry_id, region, value) VALUES (1, 'hair', 90)");
  db.raw.exec("INSERT INTO entry_body_region (entry_id, region, value) VALUES (1, 'hips', 0)");

  const rows = db.raw
    .prepare('SELECT region, value FROM entry_body_region ORDER BY region')
    .all()
    // node:sqlite hands back null-prototype rows, which deepEqual will not
    // match against a plain object literal.
    .map((r) => ({ ...(r as { region: string; value: number }) }));
  assert.deepEqual(rows, [
    { region: 'chest', value: 15 },
    { region: 'hair', value: 90 },
    { region: 'hips', value: 0 }
  ]);
});

test('a body region at the midpoint is refused - that is "picked but not answered", not a stored answer', async () => {
  const db = await migratedDb();
  db.raw.exec("INSERT INTO entry (uuid, epoch_day, timestamp, updated_at) VALUES ('e1', 100, 1000, 1000)");

  assert.throws(() =>
    db.raw.exec("INSERT INTO entry_body_region (entry_id, region, value) VALUES (1, 'chest', 50)")
  );
});

test('a body region outside the 0-100 scale is refused', async () => {
  const db = await migratedDb();
  db.raw.exec("INSERT INTO entry (uuid, epoch_day, timestamp, updated_at) VALUES ('e1', 100, 1000, 1000)");

  assert.throws(() =>
    db.raw.exec("INSERT INTO entry_body_region (entry_id, region, value) VALUES (1, 'chest', -1)")
  );
  assert.throws(() =>
    db.raw.exec("INSERT INTO entry_body_region (entry_id, region, value) VALUES (1, 'chest', 101)")
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

/* Functional audit ticket 23: a staging is free text, with no scale or
   grade left to check (the migration's own test is
   hair-stage-free-text-migration.test.ts). */
test('hair_stage holds free text and nothing else', async () => {
  const db = await migratedDb();
  const columns = (db.raw.prepare('PRAGMA table_info(hair_stage)').all() as Array<{ name: string }>).map((c) => c.name);
  assert.deepEqual(columns, ['id', 'uuid', 'epoch_day', 'description', 'updated_at']);
  assert.doesNotThrow(() =>
    db.raw.exec("INSERT INTO hair_stage (uuid, epoch_day, description, updated_at) VALUES ('h1', 100, 'diffuse thinning all over the top', 1000)")
  );
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

test('hair_photo is its own table, not a third owner on photo', async () => {
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
  exec("INSERT INTO entry_body_region (entry_id, region, value) VALUES (1, 'chest', 80)");
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

test('entry.trashed_at is nullable and indexed, defaulting to NULL', async () => {
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

test('video_note is entry-only, ordered, and unique by uuid', async () => {
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
    .prepare('SELECT uuid, name, roadmap_goal_key, procedure_uuid, tryout_uuid FROM milestone WHERE uuid = ?')
    .get('m-1') as {
    uuid: string;
    name: string;
    roadmap_goal_key: string | null;
    procedure_uuid: string | null;
    tryout_uuid: string | null;
  };
  assert.equal(row.uuid, 'm-1');
  assert.equal(row.name, 'HRT Start');
  // A milestone someone typed for themselves came from nowhere, which is a
  // resting state rather than three gaps (ADR-0045).
  assert.equal(row.roadmap_goal_key, null);
  assert.equal(row.procedure_uuid, null);
  assert.equal(row.tryout_uuid, null);
});

test('the presentation table and entry.presentation_uuid are both nullable and unfilled by default', async () => {
  const db = await migratedDb();
  db.raw.exec("INSERT INTO entry (uuid, epoch_day, timestamp, note, updated_at) VALUES ('e-1', 100, 1000, '', 1000)");

  const entryRow = db.raw.prepare("SELECT presentation_uuid FROM entry WHERE uuid = 'e-1'").get() as {
    presentation_uuid: string | null;
  };
  assert.equal(entryRow.presentation_uuid, null);

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

  db.raw.exec("UPDATE entry SET presentation_uuid = 'p-1' WHERE uuid = 'e-1'");
  const linked = db.raw.prepare("SELECT presentation_uuid FROM entry WHERE uuid = 'e-1'").get() as {
    presentation_uuid: string | null;
  };
  assert.equal(linked.presentation_uuid, 'p-1');
});

test('the era table has both bounds nullable and no fifth column', async () => {
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

test('era_mute is presence keyed by era_uuid alone', async () => {
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

  /* The squashed baseline (ticket 42), then the one step that folds 89 to
     119 (pre-publish ticket 01), then contiguous: a gap below the baseline is
     the first squash, the gap between 88 and 119 is the second, and a gap
     above 119 is a migration that went missing. */
  assert.deepEqual(
    migrations.map((migration) => migration.version),
    [
      SQUASH_BASELINE_VERSION,
      POST_RC1_SQUASH_VERSION,
      ...Array.from({ length: LATEST_SCHEMA_VERSION - POST_RC1_SQUASH_VERSION }, (_, index) => POST_RC1_SQUASH_VERSION + 1 + index)
    ],
    'the baseline, the squashed step, then every later version in order, none applied twice'
  );
  /* And the steps the squash runs are the whole of 89 to 119, in order. */
  assert.deepEqual(
    POST_RC1_STEPS.map((step) => step.version),
    Array.from({ length: POST_RC1_SQUASH_VERSION - SQUASH_BASELINE_VERSION }, (_, index) => SQUASH_BASELINE_VERSION + 1 + index)
  );
});

test('every procedure has a kind, and a row from before the column existed gets custom', async () => {
  const db = await migratedDb();

  /* No CHECK on this column (schema.ts's note on procedure) - the write layer
     validates, and the DEFAULT is what a write that names no kind gets. */
  db.raw.exec(`INSERT INTO procedure (uuid, name, surgery_epoch_day, notes, updated_at)
    VALUES ('p-old', 'top surgery', NULL, '', 1000)`);

  const row = db.raw.prepare("SELECT kind, dilation_opt_in FROM procedure WHERE uuid = 'p-old'").get() as {
    kind: string;
    dilation_opt_in: number;
  };
  assert.equal(row.kind, 'custom');
  assert.equal(row.dilation_opt_in, 0);
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

test('a WEEKLY reminder is refused by the schema, with no trigger left to translate it', async () => {
  const db = await migratedDb();
  await assert.rejects(db.run(`INSERT INTO reminder (uuid, title, time, recurrence, updated_at)
    VALUES ('archive-weekly', 'Injection', '20:00', 'WEEKLY', 1)`));
  // The deletion log's own trigger (version 117) records a removal; it translates nothing.
  const triggers = await db.query(
    "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'reminder' AND name <> 'deletion_reminder'"
  );
  assert.deepEqual(triggers, []);
});

/* Functional audit ticket 10 cut saved questions: the migration drops the
   table and its rows with it, and leaves every other row where it was. */
test('the saved-questions cut drops saved_question and nothing else', async () => {
  const db = makeNodeSqliteDb();
  await runMigrations(db, noopFileOps(), upToBaseline);
  await db.run("INSERT INTO saved_question (uuid, name, starred, updated_at) VALUES ('q1', 'Asked', 1, 1)");
  await db.run("INSERT INTO entry (uuid, epoch_day, timestamp, note, updated_at) VALUES ('e1', 100, 1000, 'kept', 1)");
  await runMigrations(db, noopFileOps(), migrations);
  const tables = (await db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")).map((row) => row.name);
  assert.ok(!tables.includes('saved_question'), 'saved_question is gone');
  assert.deepEqual(await db.query('SELECT uuid, note FROM entry'), [{ uuid: 'e1', note: 'kept' }]);
  assert.deepEqual(await db.query('PRAGMA foreign_key_check'), []);
});


/* Functional audit ticket 34 kept only the roadmap's legal track. Ticks
   against the three cut tracks go, with the per-track "not my path" table
   and the document links that named a cut goal; custom goals, legal ticks
   (an older legal key included) and documents themselves stay. */
test('the roadmap trim drops cut-track ticks and roadmap_track, and keeps custom goals in categories', async () => {
  const db = makeNodeSqliteDb();
  await runMigrations(db, noopFileOps(), preSquashChain.filter((migration) => migration.version <= 110));
  await db.run(`INSERT INTO roadmap_check (pack_key, goal_key, status, hidden, updated_at) VALUES
    ('pl', 'pl-social-tell-one-person', 'checked', 0, 1), ('pl', 'pl-presentational-voice', 'unchecked', 1, 1),
    ('pl', 'pl-medical-bloodwork', 'not-my-path', 0, 1), ('pl', 'pl-legal-court-fee', 'checked', 0, 1),
    ('pl', 'pl-legal-court-file', 'checked', 0, 1)`);
  await db.run("INSERT INTO roadmap_track (track, updated_at) VALUES ('medical', 1), ('legal', 1)");
  await db.run(`INSERT INTO roadmap_goal (uuid, track, text, status, updated_at) VALUES
    ('g1', 'social', 'Tell my sister', 'checked', 1), ('g2', 'legal', 'Find a notary', 'unchecked', 2),
    ('g3', 'medical', 'Ask about a second opinion', 'unchecked', 3), ('g4', 'social', 'Tell my brother', 'unchecked', 4)`);
  await db.run(`INSERT INTO document (uuid, epoch_day, title, file_path, target_kind, target_id, updated_at) VALUES
    ('d1', 100, 'Opinion', 'a.pdf', 'goal', 'pl-medical-psych-opinion', 1),
    ('d2', 100, 'Fee', 'b.pdf', 'goal', 'pl-legal-court-fee', 1)`);
  await db.run("INSERT INTO area_state (area, hidden, updated_at) VALUES ('roadmapTracks', 1, 1), ('roadmapGoals', 1, 1)");
  await runMigrations(db, noopFileOps(), preSquashChain);
  assert.deepEqual(await db.query('SELECT goal_key FROM roadmap_check ORDER BY goal_key'), [
    { goal_key: 'pl-legal-court-fee' },
    { goal_key: 'pl-legal-court-file' }
  ]);
  const tables = (await db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")).map((row) => row.name);
  assert.ok(!tables.includes('roadmap_track'), 'roadmap_track is gone');
  assert.deepEqual(await db.query('SELECT uuid, track, text, status FROM roadmap_goal ORDER BY id'), [
    { uuid: 'g1', track: 'social', text: 'Tell my sister', status: 'checked' },
    { uuid: 'g2', track: 'legal', text: 'Find a notary', status: 'unchecked' },
    { uuid: 'g3', track: 'medical', text: 'Ask about a second opinion', status: 'unchecked' },
    { uuid: 'g4', track: 'social', text: 'Tell my brother', status: 'unchecked' }
  ]);
  /* Round two: a goal under a cut track keeps a category of its own, named
     by the old track's key and left nameless, so the screen says the old
     name in whatever language it runs in. Legal goals sit with the legal
     steps and need none. */
  assert.deepEqual(await db.query('SELECT uuid, name FROM roadmap_category ORDER BY id'), [
    { uuid: 'social', name: '' },
    { uuid: 'medical', name: '' }
  ]);
  assert.deepEqual(await db.query('SELECT uuid, target_kind, target_id FROM document ORDER BY uuid'), [
    { uuid: 'd1', target_kind: null, target_id: null },
    { uuid: 'd2', target_kind: 'goal', target_id: 'pl-legal-court-fee' }
  ]);
  assert.deepEqual(await db.query('SELECT area FROM area_state'), [{ area: 'roadmapGoals' }]);
  assert.deepEqual(await db.query('PRAGMA foreign_key_check'), []);
});

/* Functional audit ticket 35 turned the post-ruling steps into
   institutions. A tick on one of the six that became an institution is
   dropped unless it hid the row, which stays hidden; the retired "bank,
   insurers, clinic" step goes with its tick and its document links. Paper
   filed against a step that became an institution stays filed, since the
   key did not change. */
test('the institution list adds its two tables and keeps only hidden flags of the steps it replaced', async () => {
  const db = makeNodeSqliteDb();
  await runMigrations(db, noopFileOps(), preSquashChain.filter((migration) => migration.version <= 113));
  await db.run(`INSERT INTO roadmap_check (pack_key, goal_key, status, hidden, updated_at) VALUES
    ('pl', 'pl-legal-passport', 'checked', 0, 1), ('pl', 'pl-legal-driving-licence', 'checked', 1, 1),
    ('pl', 'pl-legal-institutions', 'checked', 0, 1), ('pl', 'pl-legal-court-fee', 'checked', 0, 1)`);
  await db.run(`INSERT INTO document (uuid, epoch_day, title, file_path, target_kind, target_id, updated_at) VALUES
    ('d1', 100, 'Bank letter', 'a.pdf', 'goal', 'pl-legal-institutions', 1),
    ('d2', 100, 'Old passport', 'b.pdf', 'goal', 'pl-legal-passport', 1)`);
  await runMigrations(db, noopFileOps(), preSquashChain);
  assert.deepEqual(await db.query('SELECT goal_key, status, hidden FROM roadmap_check ORDER BY goal_key'), [
    { goal_key: 'pl-legal-court-fee', status: 'checked', hidden: 0 },
    { goal_key: 'pl-legal-driving-licence', status: 'unchecked', hidden: 1 }
  ]);
  assert.deepEqual(await db.query('SELECT uuid, target_kind, target_id FROM document ORDER BY uuid'), [
    { uuid: 'd1', target_kind: null, target_id: null },
    { uuid: 'd2', target_kind: 'goal', target_id: 'pl-legal-passport' }
  ]);
  await db.run("INSERT INTO roadmap_institution (uuid, name, updated_at) VALUES ('i1', 'Gym', 1)");
  await db.run(
    "INSERT INTO roadmap_institution_change (uuid, institution, status, epoch_day, note, updated_at) VALUES ('c1', 'i1', 'submitted', 100, NULL, 1)"
  );
  assert.deepEqual(await db.query('PRAGMA foreign_key_check'), []);
});

test('visibility migration preserves existing checked and not-my-path goals as visible', async () => {
  const db = makeNodeSqliteDb();
  await runMigrations(db, noopFileOps(), upToBaseline);
  await db.run("INSERT INTO roadmap_check (pack_key, goal_key, status, updated_at) VALUES ('pl', 'checked', 'checked', 1), ('pl', 'skipped', 'not-my-path', 1)");
  await runMigrations(db, noopFileOps(), migrations);
  assert.deepEqual(await db.query('SELECT goal_key, status, hidden FROM roadmap_check ORDER BY goal_key'), [
    { goal_key: 'checked', status: 'checked', hidden: 0 },
    { goal_key: 'skipped', status: 'not-my-path', hidden: 0 }
  ]);
});

test('released schema 88 upgrades through the current chain without rewriting old duplicated dose rows', async () => {
  const db = makeNodeSqliteDb();
  const fileOps = noopFileOps();
  await runMigrations(db, fileOps, migrations.filter((migration) => migration.version <= 88));
  for (const id of ['legacy-automatic-1', 'legacy-automatic-2']) {
    await db.run(`INSERT INTO dose_event(uuid,timestamp,route,dose,dose_unit,source,status,updated_at)
      VALUES (?,123456789,'oral',2,'mg','schedule','taken',42)`, [id]);
  }
  await runMigrations(db, fileOps, migrations);
  assert.equal(db.getUserVersion(), LATEST_SCHEMA_VERSION);
  const rows = await db.query(`SELECT uuid,timestamp,source,auto_log_episode_uuid,
    auto_log_epoch_day,auto_log_index FROM dose_event ORDER BY uuid`);
  assert.deepEqual(rows, ['legacy-automatic-1', 'legacy-automatic-2'].map((uuid) => ({
    uuid, timestamp: 123456789, source: 'schedule', auto_log_episode_uuid: null,
    auto_log_epoch_day: null, auto_log_index: null
  })));
  const plan = await db.query<{ detail: string }>(`EXPLAIN QUERY PLAN SELECT * FROM dose_event
    WHERE (timestamp >= 1 AND timestamp < 10) OR (auto_log_epoch_day >= 1 AND auto_log_epoch_day <= 10)`);
  assert.ok(plan.some((row) => row.detail.includes('idx_dose_event_timestamp')));
  assert.ok(plan.some((row) => row.detail.includes('idx_dose_event_auto_log_day')));
});
