/* An archive that carries the retired prep date still restores (phase 8
   features ticket 58, ADR-0066).

   `checklist.appointment_epoch_day` stops being written by this ticket - the
   prep date became a read over the appointment record - but it is not
   dropped, because every backup written before this ticket carries it and
   those have to keep restoring. That is the acceptance criterion this file
   holds: "checklist.appointment_epoch_day is never written after this
   ticket, and an archive that carries it still restores".

   The hazard is quiet. Nothing writes the column any more, so a snapshot
   taken on a current build has null there and would restore null whether the
   column still travelled or not - a test built that way would pass with the
   field deleted from the payload, the reader and the writer alike. So the
   value is put into the snapshot by hand, the way archive-legacy-consults.ts
   puts a payload back into its pre-rename shape, and read back off the raw
   column afterwards: there is no accessor left to read it with, which is the
   whole point of retiring it. */

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

const standaloneAppointmentDay = async (driver: SqliteDriver): Promise<number | null> => {
  const rows = await driver.query<{ appointment_epoch_day: number | null }>(
    'SELECT appointment_epoch_day FROM checklist WHERE owner_kind IS NULL LIMIT 1'
  );
  return rows[0]?.appointment_epoch_day ?? null;
};

test('an archive carrying the retired prep date restores, date and all', async () => {
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
  assert.equal(await standaloneAppointmentDay(target.driver), 19700);
});

test('nothing writes the retired prep date on a current build', async () => {
  /* The other half of the criterion. Everything that ever wrote this column
     is exercised here - the prep list is added to, an appointment is
     recorded, and a debrief is both dismissed and written - and the column
     stays null through all of it. `setAppointmentDate`, which is what used
     to set it, no longer exists to call. */
  const { driver, journal } = await device();

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

  assert.equal(await standaloneAppointmentDay(driver), null);
  assert.equal((await journal.archive.snapshot()).journal.checklists[0].appointmentEpochDay, null);
});
