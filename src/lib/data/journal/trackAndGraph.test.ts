/* Track & Graph import at the public journal seam: preview first, then one
   merge-only commit, the same shape daylio.test.ts and transtracks.test.ts
   cover for their own sources. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal } from './journal.ts';

const csv = (rows: string[]): string => ['FeatureName,Timestamp,Value', ...rows].join('\r\n');

async function setup() {
  const db = await migratedDb();
  const journal = openJournal(db, fakeFileStore());
  await journal.reconcileBuiltIns();
  return { journal };
}

test('preview counts equal the merge, importing the same file twice is a no-op, and one import_log record lands each time', async () => {
  const { journal } = await setup();
  const file = csv(['Weight,2022-09-14T21:30:41.432+01:00,72.5', 'Weight,2022-09-20T08:00:00Z,71.9']);

  const preview = await journal.archive.previewTrackAndGraphImport(file);
  assert.equal(preview.measurementCount, 2);
  assert.equal(preview.newTypeCount, 1);

  const committed = await journal.archive.commitTrackAndGraphImport(preview);
  assert.deepEqual(committed, { measurementsAdded: 2, typesAdded: 1 });

  const types = await journal.measurements.getMeasurementTypes();
  const weightType = types.find((type) => type.name === 'Weight')!;
  assert.equal(weightType.builtIn, false);
  const readings = await journal.measurements.getMeasurements(weightType.key);
  assert.equal(readings.length, 2);
  assert.deepEqual(
    readings.map((reading) => reading.value).toSorted((a, b) => a - b),
    [71.9, 72.5]
  );

  const afterFirstImport = (await journal.archive.snapshot()).journal;
  assert.equal(afterFirstImport.importLog.length, 1, 'a committed import writes one import_log record');
  assert.equal(afterFirstImport.importLog[0].source, 'trackAndGraph');
  assert.deepEqual(afterFirstImport.importLog[0].counts, { measurements: 2, types: 1 });

  const repeatPreview = await journal.archive.previewTrackAndGraphImport(file);
  assert.equal(repeatPreview.measurementCount, 0, 're-importing the same file adds nothing');
  assert.equal(repeatPreview.newTypeCount, 0, 'and mints no duplicate custom type');
  assert.deepEqual(await journal.archive.commitTrackAndGraphImport(repeatPreview), { measurementsAdded: 0, typesAdded: 0 });

  const afterRepeat = (await journal.archive.snapshot()).journal;
  assert.deepEqual({ ...afterRepeat, importLog: [] }, { ...afterFirstImport, importLog: [] });
  assert.equal(afterRepeat.importLog.length, 2, 'a no-op re-import still writes its own import_log record');
  assert.deepEqual(afterRepeat.importLog[1].counts, { measurements: 0, types: 0 });
});

test('a second import of a different file reuses the first import\'s custom type by name rather than duplicating it', async () => {
  const { journal } = await setup();
  const first = await journal.archive.previewTrackAndGraphImport(csv(['Weight,2022-09-14T21:30:41.432+01:00,72.5']));
  await journal.archive.commitTrackAndGraphImport(first);

  const second = await journal.archive.previewTrackAndGraphImport(csv(['Weight,2022-09-20T08:00:00Z,71.9']));
  assert.equal(second.newTypeCount, 0, 'Weight already exists as a custom type from the first import');
  await journal.archive.commitTrackAndGraphImport(second);

  const types = await journal.measurements.getMeasurementTypes();
  assert.equal(types.filter((type) => type.name === 'Weight').length, 1, 'no duplicate custom type was minted');
});

test('a row with an invalid Value is rejected before anything is written', async () => {
  const { journal } = await setup();
  const before = (await journal.archive.snapshot()).journal;

  await assert.rejects(
    journal.archive.previewTrackAndGraphImport(csv(['Weight,2022-09-14T21:30:41.432+01:00,not a number'])),
    /invalid Value/
  );
  assert.deepEqual((await journal.archive.snapshot()).journal, before);
});
