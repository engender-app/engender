/* An archive that carries the retired prep date still restores (phase 8
   features ticket 58, ADR-0066; schema v119, functional audit ticket 50).

   `checklist.appointment_epoch_day` stopped being written by ticket 58 - the
   prep date became a read over the appointment record - and ticket 50 dropped
   the column, but every backup written before carries the field and those
   have to keep restoring. The restore reads past it: the list and its items
   come back, and there is no column left to hold the date.

   The hazard is quiet. Nothing writes the field any more, so a snapshot
   taken on a current build has null there and would restore the same whether
   the reader looked at it or not - a test built that way would pass with a
   restore that choked on a real date. So the value is put into the snapshot
   by hand, the way archive-legacy-consults.ts puts a payload back into its
   pre-rename shape. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { ArchiveJournal } from '../archive/payload.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import type { SqliteDriver } from '../sqlite/driver.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal, type Journal } from './journal.ts';
import { restoreArchive } from './restore.ts';

async function device(): Promise<{ driver: SqliteDriver; journal: Journal }> {
  const driver = await migratedDb();
  const journal = openJournal(driver, fakeFileStore());
  await journal.reconcileBuiltIns();
  return { driver, journal };
}

async function* noFiles(): AsyncGenerator<{ name: string; bytes: Uint8Array }> {}

/** What a build before ticket 58 would have written: the standalone
    checklist carrying the date somebody set on the prep screen. */
function asWrittenBeforeTheRetirement(journal: ArchiveJournal, epochDay: number): ArchiveJournal {
  const legacy = {
    ...journal,
    checklists: journal.checklists.map((checklist) =>
      checklist.ownerKind === null ? { ...checklist, appointmentEpochDay: epochDay } : checklist
    )
  };
  // The premise of the assertions below: a current snapshot really does have
  // nothing in this column, so the value under test is the injected one.
  assert.equal(
    journal.checklists.every((checklist) => checklist.appointmentEpochDay === null),
    true
  );
  return legacy;
}

test('an archive carrying the retired prep date restores, the date left behind', async () => {
  const source = await device();
  await source.journal.checklists.addToStandaloneChecklist('ask about labs');
  const legacy = asWrittenBeforeTheRetirement((await source.journal.archive.snapshot()).journal, 19700);

  const target = await device();
  await restoreArchive(target.driver, fakeFileStore(), 'replace', { journal: legacy, files: noFiles() });

  const checklist = await target.journal.checklists.getStandaloneChecklist();
  assert.deepEqual(
    checklist?.items.map((item) => item.content),
    ['ask about labs']
  );
  assert.ok(!(await target.driver.query<{ name: string }>("SELECT name FROM pragma_table_info('checklist')")).some((c) => c.name === 'appointment_epoch_day'));
});

test('a current build writes the retired prep date as null, whatever the debrief and prep did', async () => {
  const { journal } = await device();

  await journal.checklists.addToStandaloneChecklist('ask about labs');
  const appointmentId = await journal.appointments.upsertAppointment({
    epochDay: 19800,
    procedureId: null,
    kind: 'Endocrinologist',
    place: null,
    note: null
  });
  await journal.checklists.setDebriefDismissed(appointmentId);
  const entryId = await journal.entries.upsertEntry({ epochDay: 19801, mood: 3 });
  await journal.checklists.recordDebriefEntry(entryId, appointmentId);

  assert.equal((await journal.archive.snapshot()).journal.checklists[0].appointmentEpochDay, null);
});
