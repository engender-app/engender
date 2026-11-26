/* Delete forever: a trashed entry can be purged
   now rather than after its 30 days, and the purge leaves no row and no file
   of it anywhere. Checked against the whole database and the whole file
   store, so a later table that keeps a copy of an entry fails here without
   anyone naming it. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import type { SqliteDriver } from '../sqlite/driver.ts';
import { seedCompleteArchiveJournal } from './test-support/complete-archive-journal.ts';
import { bytes } from './golden-archive-fixture.ts';
import { openJournal } from './journal.ts';

const NOTE = 'only this entry says marigold';

async function richEntry() {
  const driver = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(driver, files);
  // Everything else a journal holds, so a purge that takes too much shows.
  await seedCompleteArchiveJournal(driver, journal, bytes);
  const id = await journal.entries.upsertEntry({
    epochDay: 20_100,
    mood: 4,
    note: NOTE,
    tags: ['e-happy'],
    attachRecordings: [bytes('a recording')],
    attachVideos: [bytes('a video')]
  });
  await journal.photos.attach({ entryId: id }, { full: bytes('a photo'), thumb: bytes('its thumb') });
  await journal.marginNotes.add({ entryId: id, epochDay: 20_101, text: 'a margin note' });
  const [{ uuid }] = await driver.query<{ uuid: string }>('SELECT uuid FROM entry WHERE id = ?', [id]);
  return { driver, files, journal, id, uuid };
}

/** Every column of every table that holds the entry's rowid as an entry
    reference, its uuid, or its note. The deletion log is read on its own
    below: it keeps the uuid on purpose. */
async function rowsOfEntry(driver: SqliteDriver, id: number, uuid: string): Promise<string[]> {
  const columns = await driver.query<{ tbl: string; col: string }>(
    `SELECT m.name AS tbl, p.name AS col FROM sqlite_master m JOIN pragma_table_info(m.name) p
      WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE 'entry_fts%' AND m.name <> 'deletion'`
  );
  const found: string[] = [];
  for (const { tbl, col } of columns) {
    const isEntryRef = (tbl === 'entry' && col === 'id') || /entry_id$/.test(col);
    const [{ n }] = await driver.query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM "${tbl}" WHERE CAST("${col}" AS TEXT) IN (?, ?)${isEntryRef ? ` OR "${col}" = ?` : ''}`,
      isEntryRef ? [uuid, NOTE, id] : [uuid, NOTE]
    );
    if (n > 0) found.push(`${tbl}.${col}`);
  }
  return found;
}

test('Delete forever leaves no row and no file of the entry', async () => {
  const { driver, files, journal, id, uuid } = await richEntry();
  const entryFiles = (
    await driver.query<{ file_path: string }>(
      `SELECT file_path FROM photo WHERE entry_id = ?1 UNION ALL SELECT file_path FROM voice_recording WHERE entry_id = ?1
       UNION ALL SELECT file_path FROM video_note WHERE entry_id = ?1`,
      [id]
    )
  ).map((row) => row.file_path);
  assert.equal(entryFiles.length, 3, 'the entry has a photo, a recording and a video');
  const others = files.names().filter((name) => !entryFiles.some((path) => name.startsWith(path.replace(/\.[^.]+$/, ''))));

  await journal.entries.deleteEntry(id);
  assert.ok((await rowsOfEntry(driver, id, uuid)).length > 0, 'a trashed entry is still all there');

  await journal.entries.purgeEntry(id);

  assert.deepEqual(await rowsOfEntry(driver, id, uuid), [], 'no table keeps a row of the entry');
  /* What is left is the fact of the deletion, so an archive Merge can carry
     it to another device: the table and the uuid, and nothing of what the
     entry said. */
  assert.deepEqual(
    await driver.query("SELECT tbl, row_key FROM deletion WHERE tbl = 'entry'"),
    [{ tbl: 'entry', row_key: uuid }]
  );
  assert.deepEqual(await driver.query('SELECT 1 FROM deletion WHERE instr(row_key, ?) > 0', [NOTE]), []);
  assert.deepEqual(await driver.query('SELECT rowid FROM entry_fts WHERE rowid = ?', [id]), []);
  assert.deepEqual(files.names(), others, 'its files are gone and every other file stays');
  assert.deepEqual(await driver.query('PRAGMA foreign_key_check'), []);
});

test('Delete forever takes only an entry that is in Trash', async () => {
  const { driver, journal, id, uuid } = await richEntry();
  await journal.entries.purgeEntry(id);
  assert.ok((await rowsOfEntry(driver, id, uuid)).includes('entry.id'), 'an entry not in Trash stays');
  assert.equal((await journal.entries.getEntry(id))?.note, NOTE);
});
