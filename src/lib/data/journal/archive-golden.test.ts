/* The golden archive: one encrypted backup, committed as bytes, holding at
   least one row in every section an archive carries.

   It exists because the wiring that decides which sections travel is spread
   across a snapshot, a restore and a wire type, and a section dropped from
   one of them fails silently - the archive is simply short that area and
   everything still passes. Reading a fixture that was packed once and never
   again is the only check that notices, because nothing in this test can
   change what the fixture says an archive of that journal looks like. Each
   section's row count is pinned too (golden-archive-counts.json), not just
   whether it is empty: a section that goes from nine rows to one is still
   non-empty, and "more than zero" was the whole guarantee until ticket 12.

   Two ways to change what is committed, and they are not interchangeable.
   `GOLDEN_ARCHIVE=rebuild` packs a brand new `everySection()` journal and is
   the routine path - it is how adding a built-in dimension, preset or tag
   shows up in the fixture, because `everySection()` reconciles today's
   vocabulary itself. `GOLDEN_ARCHIVE=patch` decrypts what is committed and
   runs a transform over its journal instead of starting from nothing,
   which is what a change a fresh journal cannot reproduce on its own needs -
   see golden-archive-fixture.ts's own doc comment on `patchGoldenArchive`.
   Either way every id in the fixture changes, so a diff that touches more
   than the section under discussion is the signal to stop and look. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { openArchive } from '../archive/pack.ts';
import type { ArchiveJournal } from '../archive/payload.ts';
import {
  archivePath,
  countsPath,
  emptyDevice,
  everySection,
  GOLDEN_PASSWORD,
  journalPath,
  oneShot,
  patchGoldenArchive,
  rebuildGolden,
  repackGolden
} from './golden-archive-fixture.ts';

/** Every section `ArchiveJournal` declares. Spelled out rather than read off
    a value, so this file keeps saying what the archive carried on the day it
    was written even if the shape it is checked against moves. */
const SECTIONS = [
  'dimensions',
  'presets',
  'tagGroups',
  'presentations',
  'entryTemplates',
  'affirmations',
  'bodyRegions',
  'entries',
  'milestones',
  'labResults',
  'measurementTypes',
  'measurements',
  'sizeRecords',
  'sideEffects',
  'cycleEvents',
  'journalingPauses',
  'savedQuestions',
  'eras',
  'eraMutes',
  'effectCategories',
  'personalEffectTypes',
  'personalEffects',
  'hairStages',
  'hairPhotos',
  'hairRemovalSessions',
  'procedures',
  'reminders',
  'tallyEvents',
  'counterevidenceSnapshots',
  'letters',
  'voicePracticeTakes',
  'roadmapChecks',
  'roadmapGoals',
  'regimenEpisodes',
  'doseEvents',
  'doseSchedules',
  'dosePauses',
  'medicationStock',
  'tryouts',
  'feltSenseEntries',
  'checklists',
  'wearSessions',
  'voiceBenchmarks',
  'comfortItems',
  'areaStates',
  'importLog'
] as const satisfies readonly (keyof ArchiveJournal)[];

/** Committed alongside the fixture, not derived from it: a section's count
    changing is then a line in a diff a reviewer actually sees, rather than
    buried in an encrypted binary and a 36-key JSON file nobody reads number
    by number. Regenerating the fixture regenerates this too - both
    `rebuildGolden` and `patchGoldenArchive` write it (golden-archive-
    fixture.ts) - so the two can never quietly drift apart. */
const SECTION_COUNTS: Record<string, number> = JSON.parse(readFileSync(countsPath, 'utf8'));

if (process.env.GOLDEN_ARCHIVE === 'rebuild') {
  test('rebuilds the golden archive', async () => {
    await rebuildGolden();
  });
}

if (process.env.GOLDEN_ARCHIVE === 'patch') {
  test('patches the golden archive', async () => {
    // Edit this transform for the change at hand, run
    // `GOLDEN_ARCHIVE=patch npx vitest run src/lib/data/journal/archive-golden.test.ts`,
    // commit the three fixture files it rewrites, then put this back to the
    // identity function.
    await patchGoldenArchive((journal) => journal);
  });
}

test('the patch mechanism round-trips the fixture unchanged through the identity transform', async () => {
  const before: ArchiveJournal = JSON.parse(readFileSync(journalPath, 'utf8'));

  const { journal, packed } = await repackGolden((j) => j);
  assert.deepEqual(journal, before, 'decrypting and handing the journal back unchanged should be a no-op');

  const reopened = await openArchive(oneShot(packed), GOLDEN_PASSWORD);
  assert.deepEqual(reopened.payload.journal, before, 'repacking should not itself change the journal');
  const files = new Map<string, Uint8Array>();
  for await (const file of reopened.files) files.set(file.name, file.bytes);
  assert.equal(files.size, reopened.payload.files.length, 'repacking should carry every photo file forward');
});

test('the golden archive restores section by section into an empty journal', async () => {
  const golden: ArchiveJournal = JSON.parse(readFileSync(journalPath, 'utf8'));
  const opened = await openArchive(oneShot(new Uint8Array(readFileSync(archivePath))), GOLDEN_PASSWORD);

  const target = await emptyDevice();
  await target.archive.replace({ journal: opened.payload.journal, files: opened.files });
  const restored = (await target.archive.snapshot()).journal;

  for (const section of SECTIONS) {
    assert.equal(
      golden[section].length,
      SECTION_COUNTS[section],
      `the golden archive carries ${golden[section].length} ${section}, the committed manifest says ${SECTION_COUNTS[section]}`
    );
    assert.deepEqual(restored[section], golden[section], `${section} did not survive the restore`);
  }
});

/* The keys and their order, not just the rows under them: a section renamed
   or moved changes what is in the file, and a per-section comparison cannot
   see either. The fixture's own key order is what today's code wrote, so
   this is the half of "nothing was reordered" the loop above misses. */
test('the golden archive names its sections in the order a snapshot writes them', async () => {
  const opened = await openArchive(oneShot(new Uint8Array(readFileSync(archivePath))), GOLDEN_PASSWORD);

  assert.deepEqual(Object.keys(opened.payload.journal), [...SECTIONS]);

  const target = await emptyDevice();
  await target.archive.replace({ journal: opened.payload.journal, files: opened.files });

  assert.deepEqual(Object.keys((await target.archive.snapshot()).journal), [...SECTIONS]);
});

/* Over a device that already has rows of its own, so a Replace that fails to
   clear a section shows up as the target's leftovers surviving. Restoring
   into an empty journal cannot see that: the section registry says what
   travels, but the list of tables Replace empties first is still written out
   by hand (restore.ts's discardJournalRows), and a table missed there keeps
   stale rows through the most destructive path in the app. */
test('replacing a populated journal leaves exactly the golden archive behind', async () => {
  const golden: ArchiveJournal = JSON.parse(readFileSync(journalPath, 'utf8'));
  const opened = await openArchive(oneShot(new Uint8Array(readFileSync(archivePath))), GOLDEN_PASSWORD);

  const target = await everySection();
  await target.archive.replace({ journal: opened.payload.journal, files: opened.files });
  const restored = (await target.archive.snapshot()).journal;

  for (const section of SECTIONS) {
    assert.deepEqual(restored[section], golden[section], `${section} kept rows the replace should have discarded`);
  }
});

test('the golden archive carries the photo files its rows name', async () => {
  const opened = await openArchive(oneShot(new Uint8Array(readFileSync(archivePath))), GOLDEN_PASSWORD);

  const target = await emptyDevice();
  await target.archive.replace({ journal: opened.payload.journal, files: opened.files });

  assert.deepEqual((await target.archive.snapshot()).files, opened.payload.files);
});
