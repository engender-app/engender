/* Every deletion other than an entry's can be undone for a while, and is
   final after that (functional audit ticket 46, undoableDelete.ts).

   Each case deletes one record out of a journal with something in every
   section (the golden archive's seed), so the cascades, SET NULLs and
   unlinking writes a delete does to rows it never names are all in play.
   "Undone" is held to the strictest reading there is: every table, row by
   row and rowid by rowid, equals what it was before the delete, and every
   file is still in the store. "Final" means the deletion and its files end
   exactly where a plain delete leaves them. */

import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { fakeFileStore, type FakeFileStore } from '../photos/test-support/fake-file-store.ts';
import type { SqliteDriver } from '../sqlite/driver.ts';
import { seedCompleteArchiveJournal } from './test-support/complete-archive-journal.ts';
import { bytes } from './golden-archive-fixture.ts';
import { openJournal, type Journal } from './journal.ts';

async function device(): Promise<{ driver: SqliteDriver; journal: Journal; files: FakeFileStore }> {
  const driver = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(driver, files);
  await seedCompleteArchiveJournal(driver, journal, bytes);
  return { driver, journal, files };
}

/** Every ordinary table, whole, in rowid order. */
async function dump(driver: SqliteDriver): Promise<Record<string, unknown[]>> {
  const tables = await driver.query<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       AND name NOT LIKE 'entry_fts%' ORDER BY name`
  );
  const out: Record<string, unknown[]> = {};
  for (const { name } of tables) {
    const rows = await driver.query(`SELECT rowid AS __rowid, * FROM "${name}" ORDER BY rowid`);
    out[name] = rows.map((row) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Uint8Array ? [...value] : value]))
    );
  }
  return out;
}

const rowCounts = (tables: Record<string, unknown[]>) =>
  Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length]));

type Remove = (journal: Journal, id: string) => Promise<unknown>;

/* Each listed deletion the screens offer: the ticket's milestones, letters,
   photos and doses, and the rest. An entry is not here - it goes to Trash -
   and neither is a tally tap's removal, which is itself the undo of a tap. */
const CASES: [string, string, Remove][] = [
  ['a milestone with its photo and a filed document', 'SELECT m.uuid AS id FROM milestone m JOIN photo p ON p.milestone_id = m.id', (j, id) => j.milestones.deleteMilestone(id)],
  ['a letter', 'SELECT uuid AS id FROM letter', (j, id) => j.letters.deleteLetter(id)],
  ['a document and its file', 'SELECT uuid AS id FROM document', (j, id) => j.documents.deleteDocument(id)],
  ['a dose', 'SELECT uuid AS id FROM dose_event', (j, id) => j.doses.deleteDose(id)],
  ['a dose pause', 'SELECT uuid AS id FROM dose_pause', (j, id) => j.doses.deletePause(id)],
  ['a lab result', 'SELECT uuid AS id FROM lab_result', (j, id) => j.labs.deleteResult(id)],
  ['an appointment', 'SELECT uuid AS id FROM appointment WHERE procedure_id IS NULL', (j, id) => j.appointments.deleteAppointment(id)],
  ['a waiting-list status update', 'SELECT uuid AS id FROM appointment_status', (j, id) => j.appointments.deleteStatusUpdate(id)],
  ['a provider named on an appointment', 'SELECT p.uuid AS id FROM provider p JOIN appointment a ON a.provider_id = p.id', (j, id) => j.appointments.deleteProvider(id)],
  ['a consult', 'SELECT uuid AS id FROM appointment WHERE procedure_id IS NOT NULL', (j, id) => j.procedures.deleteConsult(id)],
  ['a procedure with its photos, checklist and consults', 'SELECT p.uuid AS id FROM procedure p JOIN procedure_photo f ON f.procedure_id = p.id', (j, id) => j.procedures.deleteProcedure(id)],
  ['a procedure photo', 'SELECT uuid AS id FROM procedure_photo', (j, id) => j.procedures.deletePhoto(id)],
  ['a checklist item', 'SELECT uuid AS id FROM checklist_item', (j, id) => j.checklists.deleteItem(id)],
  ['a side effect', 'SELECT uuid AS id FROM side_effect', (j, id) => j.sideEffects.deleteSideEffect(id)],
  ['a cycle event', 'SELECT uuid AS id FROM cycle_event', (j, id) => j.cycleEvents.deleteCycleEvent(id)],
  ['a dilation session', 'SELECT uuid AS id FROM taper_session', (j, id) => j.taper.deleteSession(id)],
  ['a wear session', 'SELECT uuid AS id FROM wear_session', (j, id) => j.wearSessions.deleteSession(id)],
  ['a hair stage', 'SELECT uuid AS id FROM hair_stage', (j, id) => j.hairProgress.deleteStage(id)],
  ['a hair photo', 'SELECT uuid AS id FROM hair_photo', (j, id) => j.hairProgress.deletePhoto(id)],
  ['a hair-removal session', 'SELECT uuid AS id FROM hair_removal_session', (j, id) => j.hairRemoval.deleteSession(id)],
  ['a hair-removal photo', 'SELECT uuid AS id FROM hair_removal_photo', (j, id) => j.hairRemoval.deletePhoto(id)],
  ['a tryout with its readings and photos', 'SELECT t.uuid AS id FROM tryout t JOIN felt_sense f ON f.tryout_id = t.id', (j, id) => j.tryouts.deleteTryout(id)],
  ['a tryout photo', 'SELECT uuid AS id FROM tryout_photo', (j, id) => j.tryouts.deletePhoto(id)],
  ['a felt-sense reading', 'SELECT uuid AS id FROM felt_sense', (j, id) => j.feltSense.remove(id)],
  ['a muted era', 'SELECT e.uuid AS id FROM era e JOIN era_mute m ON m.era_uuid = e.uuid', (j, id) => j.eras.deleteEra(id)],
  ['a custom tag on an entry', 'SELECT t.uuid AS id FROM tag t JOIN entry_tag et ON et.tag_id = t.id WHERE t.key IS NULL', (j, id) => j.tags.deleteTag(id)],
  ['a reminder', 'SELECT uuid AS id FROM reminder', (j, id) => j.reminders.deleteReminder(id)],
  ['a comfort item', 'SELECT uuid AS id FROM comfort_item', (j, id) => j.comfortItems.deleteItem(id)],
  ['a custom roadmap goal', 'SELECT uuid AS id FROM roadmap_goal', (j, id) => j.roadmap.deleteCustomGoal(id)],
  ['a roadmap category', 'SELECT uuid AS id FROM roadmap_category', (j, id) => j.roadmap.deleteCategory(id)],
  ['an added institution and its changes', 'SELECT uuid AS id FROM roadmap_institution', (j, id) => j.roadmap.deleteInstitution(id)],
  ['a dated change at an institution', 'SELECT uuid AS id FROM roadmap_institution_change', (j, id) => j.roadmap.deleteInstitutionChange(id)],
  ['a stock purchase', 'SELECT uuid AS id FROM medication_stock', (j, id) => j.stock.deleteEntry(id)],
  ['a voice benchmark', 'SELECT uuid AS id FROM voice_benchmark', (j, id) => j.voiceBenchmarks.deleteBenchmark(id)],
  ['a practice take', 'SELECT uuid AS id FROM voice_practice_take', (j, id) => j.voicePracticeTakes.deleteTake(id)],
  ['a margin note', 'SELECT uuid AS id FROM margin_note', (j, id) => j.marginNotes.remove(id)]
];

async function pick(driver: SqliteDriver, sql: string): Promise<string> {
  // In the first table's rowid order: a bare LIMIT 1 can walk the uuid
  // index instead, and two devices from one seed then pick different rows.
  const [, table, alias] = /FROM (\w+)(?: (\w)\b(?! ON))?/.exec(sql)!;
  const [row] = await driver.query<{ id: string }>(`${sql} ORDER BY ${alias ?? table}.rowid LIMIT 1`);
  assert.ok(row, `the seed holds a row for: ${sql}`);
  return row.id;
}

describe('an undoable deletion', () => {
  test.each(CASES)('%s comes back exactly as it was', async (_label, sql, remove) => {
    const { driver, journal, files } = await device();
    const id = await pick(driver, sql);
    const before = await dump(driver);
    const filesBefore = files.names();

    const deletion = await journal.undoable((j) => remove(j, id));
    assert.notDeepEqual(await dump(driver), before, 'the deletion happened');
    assert.deepEqual(files.names(), filesBefore, 'no file goes while the deletion can be undone');

    await deletion.undo();
    assert.deepEqual(await dump(driver), before, 'every row is back, rowids and stamps included');
    assert.deepEqual(files.names(), filesBefore);
    assert.deepEqual(await driver.query('PRAGMA foreign_key_check'), []);
    assert.equal((await driver.query("SELECT name FROM sqlite_temp_master")).length, 0, 'no trigger or log outlives it');
  });

  test.each(CASES)('%s is final once its window closes', async (_label, sql, remove) => {
    // Two devices from one seed differ in their uuids and stamps, so what is
    // compared with a plain delete is how many rows and files each leaves.
    const plain = await device();
    const plainFiles = plain.files.names().length;
    await remove(plain.journal, await pick(plain.driver, sql));

    const { driver, journal, files } = await device();
    const filesBefore = files.names().length;
    const id = await pick(driver, sql);
    const deletion = await journal.undoable((j) => remove(j, id));
    const deleted = await dump(driver);
    await deletion.finish();
    await deletion.undo();

    assert.deepEqual(await dump(driver), deleted, 'an undo after the window changes nothing');
    assert.deepEqual(rowCounts(deleted), rowCounts(await dump(plain.driver)), 'the rows end where a plain delete leaves them');
    assert.equal(filesBefore - files.names().length, plainFiles - plain.files.names().length, 'and so do the files');
  });
});

test('an undo that cannot put its rows back changes nothing and says so', async () => {
  const { driver, journal } = await device();
  const id = await pick(driver, 'SELECT uuid AS id FROM letter');
  const deletion = await journal.undoable((j) => j.letters.deleteLetter(id));
  // Something new takes the deleted row's uuid before the undo runs.
  await driver.run(
    "INSERT INTO letter (uuid, epoch_day, text, unlock_epoch_day, updated_at) VALUES (?, 1, 'a new one', 2, 3)",
    [id]
  );
  const blocked = await dump(driver);
  await assert.rejects(deletion.undo());
  assert.deepEqual(await dump(driver), blocked, 'the failed undo rolled back whole');
});

test('an undo never overwrites a change made to a surviving row inside the window', async () => {
  const { driver, journal } = await device();
  // A provider named on an appointment: the delete sets the appointment's
  // provider_id to NULL, and the appointment survives it.
  const id = await pick(driver, 'SELECT p.uuid AS id FROM provider p JOIN appointment a ON a.provider_id = p.id');
  const [{ appointment }] = await driver.query<{ appointment: number }>(
    'SELECT a.id AS appointment FROM appointment a JOIN provider p ON a.provider_id = p.id WHERE p.uuid = ? ORDER BY a.rowid LIMIT 1',
    [id]
  );
  const deletion = await journal.undoable((j) => j.appointments.deleteProvider(id));
  // The person names another provider on that appointment before the window closes.
  const newer = await journal.appointments.upsertProvider({ name: 'Dr Nowak', contact: null, competence: null, impressions: null });
  await driver.run('UPDATE appointment SET provider_id = (SELECT id FROM provider WHERE uuid = ?) WHERE id = ?', [newer, appointment]);
  const edited = await dump(driver);
  await assert.rejects(deletion.undo());
  assert.deepEqual(await dump(driver), edited, 'the newer edit stands and nothing came back');
});

test('a delete that throws leaves nothing behind and nothing to undo', async () => {
  const { driver, journal } = await device();
  const id = await pick(driver, 'SELECT uuid AS id FROM letter');
  const before = await dump(driver);
  await assert.rejects(
    journal.undoable(async (j) => {
      await j.letters.deleteLetter(id);
      throw new Error('a later step failed');
    })
  );
  assert.deepEqual(await dump(driver), before);
  assert.equal((await driver.query('SELECT name FROM sqlite_temp_master')).length, 0);
});
