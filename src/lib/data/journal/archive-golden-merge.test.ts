/* Sweep the live ARCHIVE_SECTION_NAMES registry (ADR-0027).
   Merging the same archive twice must preserve every section's
   row count and existing rows. restore.test.ts owns field-level
   checks such as a roadmap item's local tick. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { ArchiveJournal } from '../archive/payload.ts';
import { ARCHIVE_SECTION_NAMES } from './archiveSections.ts';
import { everySection, goldenContents } from './golden-archive-fixture.ts';

/** How each section's rows are told apart. Not `id` for all of them: a
    dimension travels by its key, an entry by its uuid (payload.ts's own
    `ArchiveEntry` never grew an `id` field), and a roadmap check has no id
    of its own at all - it is named by its pack and its goal, which is also
    why an unchecked goal travels as the row's absence rather than a status
    on it.

    Typed as `{ [K in keyof ArchiveJournal]: ... }` rather than built from a
    list, so a section `ArchiveJournal` grows and this forgets is a compile
    error - the same completeness archiveSections.ts's own
    `EverySectionRegistered` gives the registry itself. */
const SECTION_IDENTITY: { [K in keyof ArchiveJournal]: (row: ArchiveJournal[K][number]) => string } = {
  dimensions: (r) => r.key,
  presets: (r) => r.id,
  tagGroups: (r) => r.key,
  presentations: (r) => r.id,
  bodyRegions: (r) => r.id,
  entries: (r) => r.uuid,
  milestones: (r) => r.id,
  labResults: (r) => r.id,
  taper: (r) => r.id,
  taperSessions: (r) => r.id,
  sideEffects: (r) => r.id,
  cycleEvents: (r) => r.id,
  eras: (r) => r.id,
  eraMutes: (r) => r.eraUuid,
  effectCategories: (r) => r.key,
  personalEffectTypes: (r) => r.key,
  personalEffects: (r) => r.id,
  progressPhotos: (r) => r.id,
  progressPoses: (r) => r.id,
  hairRemovalSessions: (r) => r.id,
  procedures: (r) => r.id,
  providers: (r) => r.id,
  appointments: (r) => r.id,
  reminders: (r) => r.id,
  letters: (r) => r.id,
  voicePracticeTakes: (r) => r.id,
  roadmapChecks: (r) => `${r.packKey}:${r.goalKey}`,
  roadmapCategories: (r) => r.id,
  roadmapGoals: (r) => r.id,
  roadmapInstitutions: (r) => r.id,
  roadmapInstitutionChanges: (r) => r.id,
  regimenEpisodes: (r) => r.id,
  doseEvents: (r) => r.id,
  doseSchedules: (r) => r.id,
  dosePauses: (r) => r.id,
  medicationStock: (r) => r.id,
  tryouts: (r) => r.id,
  feltSenseEntries: (r) => r.id,
  marginNotes: (r) => r.id,
  documents: (r) => r.id,
  checklists: (r) => r.id,
  wearSessions: (r) => r.id,
  voiceBenchmarks: (r) => r.id,
  comfortItems: (r) => r.id,
  importLog: (r) => r.id,
  areaStates: (r) => r.area,
  deletions: (r) => `${r.table}:${r.id}`
};

test('every registered section merges idempotently and keeps the target device its own rows', async () => {
  const target = await everySection();
  const before = (await target.archive.snapshot()).journal;

  await target.archive.merge(await goldenContents());
  const afterFirstMerge = (await target.archive.snapshot()).journal;

  await target.archive.merge(await goldenContents());
  const afterSecondMerge = (await target.archive.snapshot()).journal;

  for (const section of ARCHIVE_SECTION_NAMES) {
    const identify = SECTION_IDENTITY[section] as (row: unknown) => string;
    const beforeIds = before[section].map(identify);
    const afterFirstIds = new Set(afterFirstMerge[section].map(identify));

    for (const id of beforeIds) {
      assert.ok(afterFirstIds.has(id), `${section}: the target's own row ${id} did not survive a merge`);
    }
    assert.equal(
      afterFirstMerge[section].length,
      afterSecondMerge[section].length,
      `${section}: merging the same archive twice changed its row count from ` +
        `${afterFirstMerge[section].length} to ${afterSecondMerge[section].length} - ` +
        `its apply is not matching rows this device already has`
    );
  }
});
