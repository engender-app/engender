/* Archive Merge applies edits, deletions and restores (functional audit
   ticket 48, archiveMerge.ts).

   Two devices that share a history: A is a journal with something in every
   section, and B is A restored from its own archive, so every row has the
   same identity on both. Then one side changes and the other merges its
   archive.

   The edit cases are one per table merged by `updated_at`, written as SQL
   rather than through each area's API: what is under test is the archive's
   rule for a row, and a stamped UPDATE is exactly what every area's edit
   leaves behind. The rows a table's children follow (an entry's tags, a
   template's tags, a preset's scales, a schedule's weekdays) and Trash have
   cases of their own, through the areas' APIs where one exists. */

import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import type { ArchiveJournal } from '../archive/payload.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import type { SqliteDriver } from '../sqlite/driver.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { MERGE_CLASSES } from './archiveMerge.ts';
import { everySectionDevice } from './golden-archive-fixture.ts';
import { openJournal, type Journal } from './journal.ts';
import type { RestoreContents } from './restore.ts';

interface Device {
  driver: SqliteDriver;
  journal: Journal;
}

/** What a device exports, as the other device would read it back: through
    JSON, so nothing travels that the wire cannot carry. */
async function exported(device: Device, strip?: (journal: ArchiveJournal) => ArchiveJournal): Promise<RestoreContents> {
  const snapshot = await device.journal.archive.snapshot();
  const journal = JSON.parse(JSON.stringify(snapshot.journal)) as ArchiveJournal;
  return {
    journal: strip ? strip(journal) : journal,
    files: (async function* () {
      for (const { name } of snapshot.files) yield { name, bytes: await snapshot.readFile(name) };
    })()
  };
}

async function twoDevices(): Promise<{ a: Device; b: Device }> {
  const a = await everySectionDevice();
  const driver = await migratedDb();
  const journal = openJournal(driver, fakeFileStore());
  await journal.reconcileBuiltIns();
  await journal.archive.replace(await exported(a));
  return { a, b: { driver, journal } };
}

const identity = (table: string) => {
  const merge = MERGE_CLASSES[table];
  assert.equal(merge.by, 'updatedAt');
  return merge.identity('');
};

async function firstId(driver: SqliteDriver, table: string, where = '1'): Promise<string> {
  const [row] = await driver.query<{ id: string }>(
    `SELECT ${identity(table)} AS id FROM ${table} WHERE ${where} ORDER BY rowid LIMIT 1`
  );
  assert.ok(row, `the seed holds a ${table} row`);
  return row.id;
}

const read = async (driver: SqliteDriver, table: string, column: string, id: string) =>
  (await driver.query<Record<string, unknown>>(`SELECT ${column} AS v FROM ${table} WHERE ${identity(table)} = ?`, [id]))[0]?.v;

async function edit(driver: SqliteDriver, table: string, column: string, value: string, id: string, at: number) {
  const result = await driver.run(
    `UPDATE ${table} SET ${column} = ${value}, updated_at = ? WHERE ${identity(table)} = ?`, [at, id]
  );
  assert.equal(result.changes, 1);
}

/* [table, column, the edit, which row]. Every table merged by updated_at
   has a row here except the five whose only content is a file name, an
   identity or a position in its parent's list (checklist, era_mute,
   hair_removal_photo, video_note, voice_recording) - their changes travel
   as a deletion and an insert, covered below; a newer stamp alone is
   covered for every table by the describe after this one. A checklist's content is its
   items, which have their own row above, and its owner is fixed when it is
   made. */
const EDITS: [string, string, string, string?][] = [
  ['appointment', 'note', "'edited'"],
  ['appointment_status', 'epoch_day', 'epoch_day + 1'],
  ['area_state', 'hidden', '1 - hidden'],
  ['body_region', 'hidden', '1 - hidden', 'key IS NOT NULL'],
  ['body_region', 'name', "'edited'", 'key IS NULL'],
  ['checklist_item', 'content', "'edited'"],
  ['comfort_item', 'text', "'edited'"],
  ['cycle_event', 'epoch_day', 'epoch_day + 1'],
  ['document', 'title', "'edited'"],
  ['dose_event', 'dose', 'dose + 1'],
  ['dose_pause', 'reason', "'edited'"],
  ['dose_schedule', 'doses_per_day', 'doses_per_day + 1'],
  ['effect_category', 'enabled', '1 - enabled'],
  ['entry', 'note', "'edited'"],
  ['entry_template', 'hidden', '1 - hidden', 'key IS NOT NULL'],
  ['era', 'name', "'edited'"],
  ['felt_sense', 'note', "'edited'"],
  ['gender_dimension', 'hidden', '1 - hidden', 'is_built_in = 1'],
  ['gender_dimension', 'name', "'edited'", 'is_built_in = 0'],
  ['gender_preset', 'name', "'edited'", 'key IS NULL'],
  ['hair_photo', 'epoch_day', 'epoch_day + 1'],
  ['hair_removal_session', 'provider', "'edited'"],
  ['hair_stage', 'description', "'edited'"],
  ['import_log', 'source', "'edited'"],
  ['lab_result', 'note', "'edited'"],
  ['letter', 'text', "'edited'"],
  ['margin_note', 'text', "'edited'"],
  ['medication_stock', 'quantity', 'quantity + 1'],
  ['milestone', 'name', "'edited'"],
  ['personal_effect', 'first_noticed_epoch_day', 'first_noticed_epoch_day + 1'],
  ['personal_effect_type', 'hidden', '1 - hidden', 'is_built_in = 1'],
  ['personal_effect_type', 'name', "'edited'", 'is_built_in = 0'],
  ['photo', 'starred', '1 - starred'],
  ['presentation', 'name', "'edited'"],
  ['procedure', 'notes', "'edited'"],
  ['procedure_photo', 'epoch_day', 'epoch_day + 1'],
  ['provider', 'name', "'edited'"],
  ['regimen_episode', 'dose', 'dose + 1'],
  ['reminder', 'title', "'edited'"],
  ['roadmap_category', 'name', "'edited'"],
  ['roadmap_check', 'hidden', '1 - hidden'],
  ['roadmap_goal', 'text', "'edited'"],
  ['roadmap_institution', 'name', "'edited'"],
  ['roadmap_institution_change', 'note', "'edited'"],
  ['side_effect', 'name', "'edited'"],
  ['tag', 'hidden', '1 - hidden', 'key IS NOT NULL'],
  ['tag', 'label', "'edited'", 'key IS NULL'],
  ['tag_group', 'name', "'edited'", 'uuid IS NOT NULL'],
  ['taper', 'start_epoch_day', 'start_epoch_day + 1'],
  ['taper_session', 'note', "'edited'"],
  ['tally_event', 'epoch_day', 'epoch_day + 1'],
  ['tryout', 'label', "'edited'"],
  ['tryout_photo', 'epoch_day', 'epoch_day + 1'],
  ['voice_benchmark', 'note', "'edited'"],
  ['voice_practice_take', 'felt_sense', '3'],
  ['wear_session', 'note', "'edited'"],
  // The columns added since the tables first travelled: FA 30's costs and
  // FA 20's reminder drug.
  ['appointment', 'cost_refunded', '1 - cost_refunded'],
  ['hair_removal_session', 'cost_refunded', '1 - cost_refunded'],
  ['lab_result', 'cost_refunded', '1 - cost_refunded'],
  ['medication_stock', 'cost_refunded', '1 - cost_refunded'],
  ['procedure', 'cost_refunded', '1 - cost_refunded'],
  ['reminder', 'drug', "'edited'"]
];

const later = () => Date.now() + 60_000;

describe('an edit made on one side', () => {
  test.each(EDITS)('%s.%s from the newer archive wins', async (table, column, value, where) => {
    const { a, b } = await twoDevices();
    const id = await firstId(a.driver, table, where);
    await edit(a.driver, table, column, value, id, later());
    const edited = await read(a.driver, table, column, id);
    assert.notEqual(await read(b.driver, table, column, id), edited, 'the edit is not on B yet');

    await b.journal.archive.merge(await exported(a));

    assert.equal(await read(b.driver, table, column, id), edited);
  });

  test.each(EDITS)('%s.%s on this device stays when an older archive arrives', async (table, column, value, where) => {
    const { a, b } = await twoDevices();
    const id = await firstId(b.driver, table, where);
    await edit(b.driver, table, column, value, id, later());
    const edited = await read(b.driver, table, column, id);

    await b.journal.archive.merge(await exported(a));

    assert.equal(await read(b.driver, table, column, id), edited);
  });
});

test('every table merged by updated_at has an edit case or a reason it has none', () => {
  const covered = new Set(EDITS.map(([table]) => table));
  const contentless = ['checklist', 'era_mute', 'hair_removal_photo', 'video_note', 'voice_recording'];
  const missing = Object.entries(MERGE_CLASSES)
    .filter(([table, merge]) => merge.by === 'updatedAt' && !covered.has(table) && !contentless.includes(table))
    .map(([table]) => table);
  assert.deepEqual(missing, []);
});

/* The edit cases above change a column; these change nothing but the stamp,
   which is all a newer copy of a table with no data column (era_mute: a key
   and updated_at) can differ by. Every table merged by updated_at takes a
   newer row, so a table added later with no column of its own cannot hide
   the way era_mute's raw SQL error did. */
describe('a newer copy of a row with nothing but its stamp changed', () => {
  const tables = Object.entries(MERGE_CLASSES).filter(([, merge]) => merge.by === 'updatedAt').map(([table]) => table);

  test.each(tables)('%s takes the newer stamp', async (table) => {
    const { a, b } = await twoDevices();
    const id = await firstId(a.driver, table);
    const at = later();
    await a.driver.run(`UPDATE ${table} SET updated_at = ? WHERE ${identity(table)} = ?`, [at, id]);

    await b.journal.archive.merge(await exported(a));

    assert.equal(await read(b.driver, table, 'updated_at', id), at);
  });

  test('era_mute is among them, and A holds a mute to test', async () => {
    const { a } = await twoDevices();
    assert.ok(Object.keys(MERGE_CLASSES).includes('era_mute'));
    assert.ok((await a.driver.query('SELECT 1 FROM era_mute')).length > 0);
  });
});

describe('the rows that follow their parent', () => {
  const count = async (driver: SqliteDriver, sql: string, id: string) =>
    (await driver.query<{ n: number }>(sql, [id]))[0].n;

  test("an entry's tags, scales, body map and search text come with its newer edit", async () => {
    const { a, b } = await twoDevices();
    const id = await firstId(a.driver, 'entry', 'id IN (SELECT entry_id FROM entry_tag)');
    const [{ rowid }] = await a.driver.query<{ rowid: number }>('SELECT id AS rowid FROM entry WHERE uuid = ?', [id]);
    await a.driver.run('DELETE FROM entry_tag WHERE entry_id = ?', [rowid]);
    await a.driver.run('DELETE FROM entry_dimension_value WHERE entry_id = ?', [rowid]);
    await a.driver.run('DELETE FROM entry_body_region WHERE entry_id = ?', [rowid]);
    await edit(a.driver, 'entry', 'note', "'a quokka smiled'", id, later());

    await b.journal.archive.merge(await exported(a));

    const children = (table: string) => count(b.driver, `SELECT COUNT(*) AS n FROM ${table} WHERE entry_id = (SELECT id FROM entry WHERE uuid = ?)`, id);
    assert.equal(await children('entry_tag'), 0);
    assert.equal(await children('entry_dimension_value'), 0);
    assert.equal(await children('entry_body_region'), 0);
    const found = await b.journal.entries.searchEntries('quokka', []);
    const [{ rowid: onB }] = await b.driver.query<{ rowid: number }>('SELECT id AS rowid FROM entry WHERE uuid = ?', [id]);
    assert.deepEqual(found.map((entry) => entry.id), [onB]);
  });

  test("an older entry keeps this device's tags", async () => {
    const { a, b } = await twoDevices();
    const id = await firstId(b.driver, 'entry', 'id IN (SELECT entry_id FROM entry_tag)');
    const tags = (driver: SqliteDriver) => count(driver, 'SELECT COUNT(*) AS n FROM entry_tag WHERE entry_id = (SELECT id FROM entry WHERE uuid = ?)', id);
    const before = await tags(b.driver);
    await a.driver.run('DELETE FROM entry_tag WHERE entry_id = (SELECT id FROM entry WHERE uuid = ?)', [id]);

    await b.journal.archive.merge(await exported(a));

    assert.equal(await tags(b.driver), before, 'the archive changed the tags without a newer entry, so they stay');
  });

  test("a template's tags and a preset's scales come with the newer row", async () => {
    const { a, b } = await twoDevices();
    const template = await firstId(a.driver, 'entry_template', 'key IS NULL AND id IN (SELECT template_id FROM entry_template_tag)');
    const preset = await firstId(a.driver, 'gender_preset', 'id IN (SELECT preset_id FROM preset_dimension)');
    await a.driver.run('DELETE FROM entry_template_tag WHERE template_id = (SELECT id FROM entry_template WHERE uuid = ?)', [template]);
    await a.driver.run('DELETE FROM preset_dimension WHERE preset_id = (SELECT id FROM gender_preset WHERE COALESCE(key, uuid) = ?)', [preset]);
    await edit(a.driver, 'entry_template', 'name', "'edited'", template, later());
    await edit(a.driver, 'gender_preset', 'name', "'edited'", preset, later());

    await b.journal.archive.merge(await exported(a));

    assert.equal(await count(b.driver, 'SELECT COUNT(*) AS n FROM entry_template_tag WHERE template_id = (SELECT id FROM entry_template WHERE uuid = ?)', template), 0);
    assert.equal(await count(b.driver, 'SELECT COUNT(*) AS n FROM preset_dimension WHERE preset_id = (SELECT id FROM gender_preset WHERE COALESCE(key, uuid) = ?)', preset), 0);
  });

  test("a dose schedule's weekdays come with the newer schedule", async () => {
    const { a, b } = await twoDevices();
    const id = await firstId(a.driver, 'dose_schedule');
    const sid = '(SELECT id FROM dose_schedule WHERE uuid = ?)';
    await a.driver.run(`UPDATE dose_schedule SET recurrence_kind = 'weekdays', every_n_days = NULL WHERE id = ${sid}`, [id]);
    await a.driver.run(`DELETE FROM dose_schedule_weekday WHERE schedule_id = ${sid}`, [id]);
    await a.driver.run(`INSERT INTO dose_schedule_weekday (schedule_id, weekday) VALUES (${sid}, 2), (${sid}, 5)`, [id, id]);
    await edit(a.driver, 'dose_schedule', 'doses_per_day', '1', id, later());

    await b.journal.archive.merge(await exported(a));

    const weekdays = await b.driver.query<{ weekday: number }>(`SELECT weekday FROM dose_schedule_weekday WHERE schedule_id = ${sid} ORDER BY weekday`, [id]);
    assert.deepEqual(weekdays.map((row) => row.weekday), [2, 5]);
  });
});

describe('a deletion made on one side', () => {
  /* [what, table, which row, the delete]. Plain SQL where the area's own
     delete is one statement; the area's API where it unlinks or cascades
     by hand. */
  type Delete = (device: Device, id: string) => Promise<unknown>;
  /** A milestone names the record on both devices first, through a foreign
      key that neither cascades nor sets null. */
  const LINKS = new Map<Delete, string>();
  const linked = (column: string, remove: Delete): Delete => {
    LINKS.set(remove, column);
    return remove;
  };
  const DELETES: [string, string, string, Delete][] = [
    ['a letter', 'letter', '1', (d, id) => d.driver.run('DELETE FROM letter WHERE uuid = ?', [id])],
    ['an entry deleted for good', 'entry', '1', (d, id) => d.driver.run('DELETE FROM entry WHERE uuid = ?', [id])],
    ['a photo', 'photo', 'entry_id IS NOT NULL', (d, id) => d.driver.run('DELETE FROM photo WHERE uuid = ?', [id])],
    ['a checklist item', 'checklist_item', '1', (d, id) => d.journal.checklists.deleteItem(id)],
    ['a custom tag', 'tag', 'key IS NULL', (d, id) => d.journal.tags.deleteTag(id)],
    ['a procedure a milestone names', 'procedure', '1', linked('procedure_uuid', (d, id) => d.journal.procedures.deleteProcedure(id))],
    ['a tryout a milestone names', 'tryout', '1', linked('tryout_uuid', (d, id) => d.journal.tryouts.deleteTryout(id))],
    ['an added institution and its changes', 'roadmap_institution', '1', (d, id) => d.journal.roadmap.deleteInstitution(id)],
    ['a stock row', 'medication_stock', '1', (d, id) => d.driver.run('DELETE FROM medication_stock WHERE drug_key = ?', [id])],
    ['a roadmap tick', 'roadmap_check', '1', (d, id) => d.driver.run("DELETE FROM roadmap_check WHERE pack_key || char(10) || goal_key = ?", [id])],
    ['a waiting-list update', 'appointment_status', '1', (d, id) => d.journal.appointments.deleteStatusUpdate(id)],
    ['an era mute', 'era_mute', '1', (d, id) => d.driver.run('DELETE FROM era_mute WHERE era_uuid = ?', [id])],
    ['a dose schedule and its weekdays', 'dose_schedule', '1', (d, id) => d.driver.run('DELETE FROM dose_schedule WHERE uuid = ?', [id])]
  ];

  const present = async (driver: SqliteDriver, table: string, id: string) =>
    (await driver.query(`SELECT 1 FROM ${table} WHERE ${identity(table)} = ?`, [id])).length === 1;

  test.each(DELETES)('%s applies on the other side', async (_what, table, where, remove) => {
    const { a, b } = await twoDevices();
    const id = await firstId(a.driver, table, where);
    const column = LINKS.get(remove);
    if (column) {
      for (const { driver } of [a, b]) {
        await driver.run(`UPDATE milestone SET ${column} = ? WHERE id = (SELECT MIN(id) FROM milestone)`, [id]);
      }
    }
    await remove(a, id);
    assert.ok(!(await present(a.driver, table, id)));

    await b.journal.archive.merge(await exported(a));

    assert.ok(!(await present(b.driver, table, id)), `${table} ${id} is still on B`);
    assert.deepEqual(await b.driver.query('PRAGMA foreign_key_check'), []);
  });

  test('an edit made after the deletion, on the other side, keeps the row, and brings it back to the deleting side', async () => {
    const { a, b } = await twoDevices();
    const id = await firstId(a.driver, 'letter');
    await a.driver.run('DELETE FROM letter WHERE uuid = ?', [id]);
    await edit(b.driver, 'letter', 'text', "'written after'", id, later());

    await b.journal.archive.merge(await exported(a));
    assert.equal(await read(b.driver, 'letter', 'text', id), 'written after');
    // The deletion is recorded on B all the same, so B's archive carries it on.
    assert.equal((await b.driver.query("SELECT 1 FROM deletion WHERE tbl = 'letter' AND row_key = ?", [id])).length, 1);

    await a.journal.archive.merge(await exported(b));
    assert.equal(await read(a.driver, 'letter', 'text', id), 'written after');
  });

  test('an archive from before the deletion does not bring the row back', async () => {
    const { a, b } = await twoDevices();
    const id = await firstId(b.driver, 'letter');
    await b.driver.run('DELETE FROM letter WHERE uuid = ?', [id]);

    await b.journal.archive.merge(await exported(a));

    assert.ok(!(await present(b.driver, 'letter', id)));
  });

  test('a deletion taken back with Undo does not travel', async () => {
    const { a, b } = await twoDevices();
    const id = await firstId(a.driver, 'letter');
    const deletion = await a.journal.undoable((j) => j.letters.deleteLetter(id));
    await deletion.undo();

    await b.journal.archive.merge(await exported(a));

    assert.ok(await present(b.driver, 'letter', id));
    assert.deepEqual(await a.driver.query("SELECT 1 FROM deletion WHERE tbl = 'letter'"), []);
  });

  test('a deletion travels on to a third device', async () => {
    const { a, b } = await twoDevices();
    const id = await firstId(a.driver, 'letter');
    await a.driver.run('DELETE FROM letter WHERE uuid = ?', [id]);
    await b.journal.archive.merge(await exported(a));

    const c = (await twoDevices()).b;
    await c.journal.archive.merge(await exported(b));

    assert.ok(!(await present(c.driver, 'letter', id)));
  });
});

describe('Trash', () => {
  const trashed = async (driver: SqliteDriver, id: string) =>
    (await driver.query<{ trashed_at: number | null }>('SELECT trashed_at FROM entry WHERE uuid = ?', [id]))[0].trashed_at;
  const rowid = async (driver: SqliteDriver, id: string) =>
    (await driver.query<{ id: number }>('SELECT id FROM entry WHERE uuid = ?', [id]))[0].id;

  test('moving an entry to Trash and restoring it each reach the other side', async () => {
    const { a, b } = await twoDevices();
    const id = await firstId(a.driver, 'entry');
    await a.journal.entries.deleteEntry(await rowid(a.driver, id));

    await b.journal.archive.merge(await exported(a));
    assert.equal(await trashed(b.driver, id), await trashed(a.driver, id));
    assert.notEqual(await trashed(b.driver, id), null, 'in Trash on B');
    const [{ day }] = await b.driver.query<{ day: number }>('SELECT epoch_day AS day FROM entry WHERE uuid = ?', [id]);
    const onB = await rowid(b.driver, id);
    assert.ok(!(await b.journal.entries.entriesForDay(day)).some((entry) => entry.id === onB), 'and out of the journal there');

    await new Promise((resolve) => setTimeout(resolve, 2));
    await a.journal.entries.restoreEntry(await rowid(a.driver, id));
    await b.journal.archive.merge(await exported(a));
    assert.equal(await trashed(b.driver, id), null, 'restored on B');
  });

  test('a trashed entry and its photos travel in a Replace too', async () => {
    const { a } = await twoDevices();
    const id = await firstId(a.driver, 'entry', 'id IN (SELECT entry_id FROM photo)');
    await a.journal.entries.deleteEntry(await rowid(a.driver, id));

    const c = (await twoDevices()).b;
    await c.journal.archive.replace(await exported(a));

    assert.notEqual(await trashed(c.driver, id), null);
    const photos = await c.driver.query('SELECT 1 FROM photo WHERE entry_id = (SELECT id FROM entry WHERE uuid = ?)', [id]);
    assert.ok(photos.length > 0);
  });
});

/** Every table but the search index's storage, row by row. */
async function dump(driver: SqliteDriver): Promise<Record<string, unknown[]>> {
  const tables = await driver.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'entry_fts%' ORDER BY name"
  );
  const out: Record<string, unknown[]> = {};
  for (const { name } of tables) out[name] = await driver.query(`SELECT rowid AS __rowid, * FROM "${name}" ORDER BY rowid`);
  return out;
}

test('merging the same archive twice leaves the journal as merging it once did', async () => {
  const { a, b } = await twoDevices();
  await edit(a.driver, 'letter', 'text', "'edited'", await firstId(a.driver, 'letter'), later());
  await a.driver.run('DELETE FROM comfort_item WHERE uuid = ?', [await firstId(a.driver, 'comfort_item')]);
  await a.journal.entries.deleteEntry(await (async () => (await a.driver.query<{ id: number }>('SELECT id FROM entry ORDER BY id LIMIT 1'))[0].id)());
  await edit(b.driver, 'milestone', 'name', "'edited on B'", await firstId(b.driver, 'milestone'), later());

  await b.journal.archive.merge(await exported(a));
  const once = await dump(b.driver);
  await b.journal.archive.merge(await exported(a));

  assert.deepEqual(await dump(b.driver), once);
});

test('an archive written before this ticket still merges by adding only what is missing', async () => {
  const { a, b } = await twoDevices();
  const id = await firstId(a.driver, 'letter');
  await edit(a.driver, 'letter', 'text', "'edited'", id, later());
  const unstamped = (journal: ArchiveJournal) =>
    JSON.parse(JSON.stringify({ ...journal, deletions: undefined }, (key, value) => (key === 'updatedAt' ? undefined : value))) as ArchiveJournal;

  await b.journal.archive.merge(await exported(a, unstamped));

  assert.notEqual(await read(b.driver, 'letter', 'text', id), 'edited');
});
