/* Pixels import at the public journal seam: preview first, then one
   merge-only commit, the same shape daylio.test.ts and
   journal/transtracks.test.ts cover for their own sources. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { openJournal } from './journal.ts';

const backup = (records: Record<string, unknown>[]): Uint8Array => new TextEncoder().encode(JSON.stringify(records));

async function setup() {
  const db = await migratedDb();
  const journal = openJournal(db, fakeFileStore());
  await journal.reconcileBuiltIns();
  return journal;
}

test('preview counts equal the merge, and importing the same Pixels backup twice is a no-op', async () => {
  const journal = await setup();
  const bytes = backup([
    {
      date: '2026-9-1',
      type: 'MOOD',
      scores: [3],
      notes: 'test',
      tags: [{ type: 'Emotions', entries: ['Grateful', 'Excited'] }]
    }
  ]);

  const preview = await journal.archive.previewPixelsImport(bytes);
  assert.equal(preview.entryCount, 1);
  assert.equal(preview.newTagCount, 2);

  const committed = await journal.archive.commitPixelsImport(preview);
  assert.deepEqual(committed, { entriesAdded: 1, tagsAdded: 2 });

  const afterFirstImport = (await journal.archive.snapshot()).journal;
  assert.equal(afterFirstImport.importLog.length, 1, 'a committed import writes one import_log record');
  assert.equal(afterFirstImport.importLog[0].source, 'pixels');
  assert.deepEqual(afterFirstImport.importLog[0].counts, { entries: 1, tags: 2 });

  const repeatPreview = await journal.archive.previewPixelsImport(bytes);
  assert.equal(repeatPreview.entryCount, 0);
  assert.equal(repeatPreview.newTagCount, 0);
  assert.equal(repeatPreview.matchedTagCount, 2);
  assert.deepEqual(await journal.archive.commitPixelsImport(repeatPreview), { entriesAdded: 0, tagsAdded: 0 });

  // A no-op re-import still writes its own import_log record - the journal
  // otherwise matches, minus that log (the same check transtracks.test.ts
  // makes for its own source).
  const afterRepeat = (await journal.archive.snapshot()).journal;
  assert.deepEqual({ ...afterRepeat, importLog: [] }, { ...afterFirstImport, importLog: [] });
  assert.equal(afterRepeat.importLog.length, 2);
  assert.deepEqual(afterRepeat.importLog[1].counts, { entries: 0, tags: 0 });
});

test('an invalid date is rejected before anything is written', async () => {
  const journal = await setup();
  const before = (await journal.archive.snapshot()).journal;
  const bytes = backup([{ date: '2026-13-1', type: 'MOOD', scores: [3], notes: '', tags: [] }]);

  await assert.rejects(journal.archive.previewPixelsImport(bytes), /invalid date/i);
  assert.deepEqual((await journal.archive.snapshot()).journal, before);
});
