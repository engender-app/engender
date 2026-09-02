/* TransTracks import at the public journal seam: preview first, then one
   merge-only commit, the same shape daylio.test.ts covers for Daylio.

   `normalize` here is a stand-in, not normalizePhoto(): that one needs a
   canvas and only the browser tier can run it (normalize.ts's own header).
   This file proves the wiring - identity, skip-existing, which bytes land
   under which file name - not the resizing itself. */

import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';
import { test } from 'vitest';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { photoFileName, thumbFileName } from '../photos/names.ts';
import { openJournal } from './journal.ts';
import type { NormalizedPhoto } from './photos.ts';

function backup(opts: {
  milestones?: Record<string, unknown>[];
  photos?: Record<string, unknown>[];
  photoFiles?: Record<string, Uint8Array>;
}): Uint8Array {
  const files: Record<string, Uint8Array> = {
    'data.json': strToU8(
      JSON.stringify({
        settings: { currentAndroidVersion: 448, startDate: 18628, theme: 'pink' },
        photos: opts.photos ?? [],
        milestones: opts.milestones ?? []
      })
    )
  };
  for (const [name, bytes] of Object.entries(opts.photoFiles ?? {})) {
    files[`photos/${name}`] = bytes;
  }
  return zipSync(files);
}

// A trivial stand-in for normalizePhoto(): wraps the raw bytes as both the
// full photo and its thumbnail, tagging the thumbnail so a test can tell
// them apart without a real image codec.
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

test('preview counts equal the merge, and importing the same TransTracks backup twice is a no-op', async () => {
  const { journal, fileStore } = await setup();
  const existingMilestoneId = await journal.milestones.upsertMilestone({ name: 'already here', epochDay: 19_000 });
  const bytes = backup({
    milestones: [
      { id: 'm-1', epochDay: 20_000, timestamp: 1_700_000_000_000, title: 'Started HRT', description: 'Hands shaking' }
    ],
    photos: [{ id: 'p-1', epochDay: 20_010, timestamp: 1_700_100_000_000, fileName: 'face.jpg', type: 0 }],
    photoFiles: { 'face.jpg': strToU8('the photo bytes') }
  });

  const preview = await journal.archive.previewTransTracksImport(bytes);
  assert.equal(preview.milestoneCount, 1);
  assert.equal(preview.photoCount, 1);
  assert.deepEqual(preview.ignoredFields, ['type (face or body)']);

  const committed = await journal.archive.commitTransTracksImport(preview, fakeNormalize);
  assert.deepEqual(committed, { milestonesAdded: 1, photosAdded: 1 });

  const milestones = await journal.milestones.getMilestones();
  assert.ok(milestones.some((m) => m.id === existingMilestoneId && m.name === 'already here'));
  const imported = milestones.find((m) => m.name === 'Started HRT')!;
  assert.equal(imported.description, 'Hands shaking');
  assert.equal(imported.id, 'm-1');

  const fileName = photoFileName('p-1');
  assert.deepEqual(new TextDecoder().decode((await fileStore.read(fileName))!), 'the photo bytes');
  assert.deepEqual(new TextDecoder().decode((await fileStore.read(thumbFileName(fileName)))!), 'thumb:the photo bytes');

  const beforeRepeat = (await journal.archive.snapshot()).journal;
  const repeatPreview = await journal.archive.previewTransTracksImport(bytes);
  assert.equal(repeatPreview.milestoneCount, 0);
  assert.equal(repeatPreview.photoCount, 0);
  assert.deepEqual(await journal.archive.commitTransTracksImport(repeatPreview, fakeNormalize), {
    milestonesAdded: 0,
    photosAdded: 0
  });
  assert.deepEqual((await journal.archive.snapshot()).journal, beforeRepeat);
});

test('a photo whose file is absent from the zip is rejected before anything is written', async () => {
  const { journal } = await setup();
  const before = (await journal.archive.snapshot()).journal;
  const bytes = backup({ photos: [{ id: 'p-1', epochDay: 20_010, fileName: 'missing.jpg', type: 0 }] });

  await assert.rejects(journal.archive.previewTransTracksImport(bytes), /missing\.jpg/);
  assert.deepEqual((await journal.archive.snapshot()).journal, before);
});
