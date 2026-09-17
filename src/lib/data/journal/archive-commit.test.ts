/* What an import commit promises about what it committed (pre-production
   audit A1). The audit reproduced two faults here, and both are kept as
   regression tests because neither is visible from the outside without
   breaking something on purpose: an import that restores rows and then
   fails somewhere afterwards used to reject, which left the entries on
   disk, the import history without a record of them, and every live read
   showing the journal as it was before. The person is then looking at a
   failure message over data that is really there, and the obvious next
   move - import the file again - is the one that duplicates it.

   The faults are injected at the two places the audit hit: the history
   insert, and a file-size read inside a snapshot the commit path no longer
   takes. Both run through real SQLite and the observed journal seam, since
   the whole claim is about what is on disk and what the read layer was
   told. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { observeWrites, type TableName } from '../live/writes.ts';
import { openJournal, type Journal, type PhotoFileStore } from './journal.ts';
import { countingDriver } from './test-support.ts';

const DAYLIO_HEADER = 'full_date,date,weekday,time,mood,activities,note_title,note';

/** Rows a day apart, each carrying the same one activity, so a commit adds
    both entries and exactly one tag and the two counts cannot be confused
    for each other. */
function daylioCsv(rows: number): string {
  const lines = [DAYLIO_HEADER];
  for (let i = 0; i < rows; i += 1) {
    const at = new Date(Date.UTC(2026, 0, 1 + i, 7, 15));
    const date = at.toISOString().slice(0, 10);
    lines.push(`${date},January ${at.getUTCDate()},Thursday,07:15,Rad,swimming,,daylio fixture ${i}`);
  }
  return lines.join('\n');
}

const naming = { tagLabels: () => [] };

async function device() {
  const db = await migratedDb();
  const store = fakeFileStore();

  let failingRun: RegExp | null = null;
  let failingSize = false;

  /* The store's own failNthWrite() counts writes, which is the wrong handle
      here: this fault is a read of a file that is already there, standing
      in for the audit's second probe. */
  const files: PhotoFileStore = {
    ...store,
    async size(name) {
      if (failingSize) throw new Error('file size read failed');
      return store.size(name);
    }
  };

  const counting = countingDriver(db, {
    onRun(sql) {
      if (failingRun?.test(sql)) throw new Error('the injected statement failed');
    }
  });

  const announced: TableName[][] = [];
  const plain = openJournal(counting.driver, files);
  await plain.reconcileBuiltIns();
  const journal: Journal = observeWrites(plain, (tables) => announced.push([...tables]));

  return {
    journal,
    announced,
    async rowsIn(table: string): Promise<number> {
      const [row] = await db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
      return row.n;
    },
    failEveryRunMatching(pattern: RegExp) {
      failingRun = pattern;
    },
    failEverySizeRead() {
      failingSize = true;
    }
  };
}

test('a history insert that fails takes the restored rows down with it', async () => {
  const made = await device();
  const preview = await made.journal.archive.previewDaylioImport(daylioCsv(3), naming);
  const entriesBefore = await made.rowsIn('entry');

  made.failEveryRunMatching(/INSERT INTO import_log/i);
  made.announced.length = 0;

  await assert.rejects(made.journal.archive.commitDaylioImport(preview));

  // Nothing restored, nothing recorded, and nothing told the read layer a
  // table had changed - the three have to agree even when the commit fails.
  assert.equal(await made.rowsIn('entry'), entriesBefore);
  assert.deepEqual(await made.journal.archive.importLog(), []);
  assert.deepEqual(made.announced, []);
});

test('a file-size read that fails after the rows are written cannot fail the import', async () => {
  const made = await device();
  const entryId = await made.journal.entries.upsertEntry({ epochDay: 100, mood: 4 });
  await made.journal.photos.attach(
    { entryId },
    { full: new Uint8Array([1, 2]), thumb: new Uint8Array([3]) }
  );

  const preview = await made.journal.archive.previewDaylioImport(daylioCsv(2), naming);
  // Armed after the preview, which resolves against a snapshot of its own:
  // the fault under test is a read taken once the rows are already in.
  made.failEverySizeRead();
  made.announced.length = 0;

  const committed = await made.journal.archive.commitDaylioImport(preview);

  assert.deepEqual(committed, { entriesAdded: 2, tagsAdded: 1 });
  assert.equal((await made.journal.archive.importLog()).length, 1);
  assert.equal(made.announced.length, 1);
});

test('a committed import returns the rows it added, records them once and invalidates reads', async () => {
  const made = await device();
  const preview = await made.journal.archive.previewDaylioImport(daylioCsv(4), naming);
  const entriesBefore = await made.rowsIn('entry');
  const tagsBefore = await made.rowsIn('tag');
  made.announced.length = 0;

  const committed = await made.journal.archive.commitDaylioImport(preview);

  assert.equal((await made.rowsIn('entry')) - entriesBefore, committed.entriesAdded);
  assert.equal((await made.rowsIn('tag')) - tagsBefore, committed.tagsAdded);

  const log = await made.journal.archive.importLog();
  assert.equal(log.length, 1);
  assert.equal(log[0].source, 'daylio');
  assert.deepEqual(log[0].counts, { entries: committed.entriesAdded, tags: committed.tagsAdded });
  assert.equal(made.announced.length, 1);
});
