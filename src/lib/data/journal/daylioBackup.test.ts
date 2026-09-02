/* Daylio backup import at the public journal seam (phase 7 ticket 09):
   preview first, then one merge-only commit, against a real migrated
   database rather than against the resolver's own output.

   This is the tier that catches what the pure tests cannot - that an
   imported entry's dimension key resolves to a row that exists, that a
   photo arrives as two files rather than one, and that the second import
   of the same file writes nothing. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { dateInputValueFromEpochDay } from '../epochDay.ts';
import { makeDaylioBackup, daylioPayload } from '../archive/test-support/daylio-backup.ts';
import { thumbFileName } from '../photos/names.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal } from './journal.ts';

const naming = { tagLabels: () => [] };

/** A journal and the file store behind it, which is what the photo half
    of this ticket has to be able to look inside. */
async function journalWithFiles() {
  const files = fakeFileStore();
  const journal = openJournal(await migratedDb(), files);
  await journal.reconcileBuiltIns();
  return { journal, files };
}

/** Stands in for photos/normalize.ts, which needs a canvas: the shape of
    what it returns is what this seam depends on, not its pixels. */
const normalize = async (bytes: Uint8Array) => ({
  full: new Uint8Array([0xff, 0xd8, ...bytes]),
  thumb: new Uint8Array([0xff, 0xd8, 1])
});

test('a backup imports through the journal, and the second import adds nothing', async () => {
  const { journal, files } = await journalWithFiles();
  const backup = await makeDaylioBackup();

  const preview = await journal.archive.previewDaylioBackupImport(backup, naming);
  assert.deepEqual(preview.unmappedMoodNames, []);

  const committed = await journal.archive.commitDaylioBackupImport(preview, normalize);
  assert.deepEqual(committed, { entriesAdded: 3, milestonesAdded: 2, tagsAdded: 2, attachmentsAdded: 3 });

  const entries = await journal.entries.recentDays(10);
  assert.equal(entries.length, 3);

  const milestones = await journal.milestones.getMilestones();
  assert.deepEqual(
    milestones.map((milestone) => `${dateInputValueFromEpochDay(milestone.epochDay)} ${milestone.name}`).toSorted(),
    ['1999-12-31 came out to my sister', '2026-03-04 first appointment']
  );

  const again = await journal.archive.previewDaylioBackupImport(backup, naming);
  assert.equal(again.entryCount, 0);
  assert.deepEqual(await journal.archive.commitDaylioBackupImport(again, normalize), {
    entriesAdded: 0,
    milestonesAdded: 0,
    tagsAdded: 0,
    attachmentsAdded: 0
  });
  assert.equal((await journal.entries.recentDays(10)).length, 3);
});

test('an imported photo arrives as its full file and its derived thumbnail', async () => {
  const { journal, files } = await journalWithFiles();

  const preview = await journal.archive.previewDaylioBackupImport(await makeDaylioBackup(), naming);
  const photo = preview.assets.find((asset) => asset.kind === 'photo')!;
  const audio = preview.assets.find((asset) => asset.kind === 'audio')!;
  await journal.archive.commitDaylioBackupImport(preview, normalize);

  assert.ok(await files.size(photo.fileName));
  assert.ok(await files.size(thumbFileName(photo.fileName)));
  // A recording has no thumbnail pair and is stored as its own bytes.
  assert.deepEqual(await files.read(audio.fileName), await audio.read());
});

test("an imported entry's custom scale value resolves against a dimension row that exists", async () => {
  const { journal } = await journalWithFiles();

  const preview = await journal.archive.previewDaylioBackupImport(await makeDaylioBackup(), naming);
  await journal.archive.commitDaylioBackupImport(preview, normalize);

  const dimensions = await journal.dimensions.getDimensions();
  const imported = dimensions.find((dimension) => dimension.name === 'Sen');
  assert.ok(imported, 'the scale arrived as a gender dimension');

  const entries = await journal.entries.recentDays(10);
  const withValue = entries.find((entry) => Object.keys(entry.dims ?? {}).length > 0);
  assert.ok(withValue, 'the entry kept its scale value');
  assert.deepEqual(withValue.dims, { [imported.key]: 3 });
});

test('an unmapped mood is refused at commit, with nothing written', async () => {
  const { journal } = await journalWithFiles();
  const moods = (daylioPayload().customMoods as Record<string, unknown>[]).map((mood) => ({
    ...mood,
    mood_group_id: 11
  }));

  const preview = await journal.archive.previewDaylioBackupImport(
    await makeDaylioBackup({ ...daylioPayload(), customMoods: moods }),
    naming
  );
  assert.ok(preview.unmappedMoodNames.length > 0);

  await assert.rejects(journal.archive.commitDaylioBackupImport(preview, normalize), /no scale position/);
  assert.equal((await journal.entries.recentDays(10)).length, 0);
});

test('a photo the pipeline cannot decode fails the import with the journal untouched', async () => {
  const { journal } = await journalWithFiles();

  const preview = await journal.archive.previewDaylioBackupImport(await makeDaylioBackup(), naming);
  const refusing = async () => {
    throw new Error('unreadable image');
  };

  await assert.rejects(journal.archive.commitDaylioBackupImport(preview, refusing), /unreadable image/);
  assert.equal((await journal.entries.recentDays(10)).length, 0);
  assert.equal((await journal.milestones.getMilestones()).length, 0);
});
