/* Day One import at the public journal seam: preview first, then one
   merge-only commit, the same shape daylio.test.ts and transtracks.test.ts
   cover for their own sources.

   `normalize` here is a stand-in, not normalizePhoto(): that one needs a
   canvas and only the browser tier can run it (normalize.ts's own header).
   This file proves the wiring - identity, skip-existing, the import_log
   record, which bytes land under which file name - not the resizing
   itself. */

import assert from 'node:assert/strict';
import { strToU8 } from 'fflate';
import { test } from 'vitest';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { thumbFileName } from '../photos/names.ts';
import { openJournal } from './journal.ts';
import type { NormalizedPhoto } from './photos.ts';
import { makeDayOneExport } from '../archive/test-support/dayone.ts';

// The same stand-in transtracks.test.ts uses: wraps the raw bytes as both
// the full photo and its thumbnail, tagging the thumbnail so a test can
// tell them apart without a real image codec.
const fakeNormalize = async (raw: Uint8Array): Promise<NormalizedPhoto> => ({
  full: raw,
  thumb: strToU8(`thumb:${new TextDecoder().decode(raw)}`)
});

async function setup() {
  const db = await migratedDb();
  const fileStore = fakeFileStore();
  const journal = openJournal(db, fileStore);
  await journal.reconcileBuiltIns();
  return { journal, fileStore };
}

const naming = { tagLabels: () => [] };

test('preview counts equal the merge, and importing the same Day One export twice is a no-op', async () => {
  const { journal, fileStore } = await setup();
  const existingEntry = await journal.entries.upsertEntry({ epochDay: 19_000, mood: 3, note: 'already here' });
  const bytes = await makeDayOneExport();

  const preview = await journal.archive.previewDayOneImport(bytes, naming);
  assert.equal(preview.entryCount, 4);
  assert.equal(preview.photoCount, 2);

  const committed = await journal.archive.commitDayOneImport(preview, fakeNormalize);
  assert.deepEqual(committed, { entriesAdded: 4, photosAdded: 2 });

  assert.equal((await journal.entries.getEntry(existingEntry))?.note, 'already here');

  const withPhoto = preview.journal.entries.find((e) => e.note.startsWith('A good day'))!;
  const fileName = withPhoto.photos[0].fileName;
  const raw = preview.rawPhotos.get(fileName)!;
  assert.deepEqual(await fileStore.read(fileName), raw);
  assert.deepEqual(new TextDecoder().decode((await fileStore.read(thumbFileName(fileName)))!), `thumb:${new TextDecoder().decode(raw)}`);

  const afterFirstImport = (await journal.archive.snapshot()).journal;
  assert.equal(afterFirstImport.importLog.length, 1, 'a committed import writes one import_log record');
  assert.equal(afterFirstImport.importLog[0].source, 'dayone');
  assert.deepEqual(afterFirstImport.importLog[0].counts, { entries: 4, photos: 2 });

  const repeatPreview = await journal.archive.previewDayOneImport(bytes, naming);
  assert.equal(repeatPreview.entryCount, 0);
  assert.equal(repeatPreview.rawPhotos.size, 0);
  assert.deepEqual(await journal.archive.commitDayOneImport(repeatPreview, fakeNormalize), {
    entriesAdded: 0,
    photosAdded: 0
  });

  // A no-op re-import still writes its own import_log record - confirming
  // happened either way - so the journal otherwise matches, minus that log.
  const afterRepeat = (await journal.archive.snapshot()).journal;
  assert.deepEqual({ ...afterRepeat, importLog: [] }, { ...afterFirstImport, importLog: [] });
  assert.equal(afterRepeat.importLog.length, 2);
  assert.deepEqual(afterRepeat.importLog[1].counts, { entries: 0, photos: 0 });
});

test('a metadata.version other than "1.0" is refused before anything is written', async () => {
  const { journal } = await setup();
  const before = (await journal.archive.snapshot()).journal;
  const bytes = await makeDayOneExport({ metadata: { version: '2.0' } });

  await assert.rejects(journal.archive.previewDayOneImport(bytes, naming), /metadata\.version/);
  assert.deepEqual((await journal.archive.snapshot()).journal, before);
});
