/* Unit tests for the procedures area and milestone linking (phase 5 ticket 12, ADR-0045). */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal } from './journal.ts';

test('a procedure round-trips with a free-text name and optional surgery date', async () => {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);

  const top = await journal.procedures.upsertProcedure({ name: 'top surgery', surgeryEpochDay: 20100, notes: 'dr smith' });
  const unscheduled = await journal.procedures.upsertProcedure({ name: 'facial surgery' });
  const orchie = await journal.procedures.upsertProcedure({ name: 'orchiectomy', surgeryEpochDay: 20000 });

  const list = await journal.procedures.getProcedures();
  assert.deepEqual(list.map((p) => p.name), ['orchiectomy', 'top surgery', 'facial surgery']);
  assert.equal(list[0].id, orchie);
  assert.equal(list[1].id, top);
  assert.equal(list[2].id, unscheduled);
  assert.equal(list[2].surgeryEpochDay, null);
  assert.equal(list[1].notes, 'dr smith');
});

test('consult dates can be added and removed individually', async () => {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);

  const id = await journal.procedures.upsertProcedure({ name: 'top surgery' });
  const c1 = await journal.procedures.addConsult(id, 19900);
  const c2 = await journal.procedures.addConsult(id, 19950);

  let [proc] = await journal.procedures.getProcedures();
  assert.deepEqual(proc.consults.map((c) => c.epochDay), [19900, 19950]);

  await journal.procedures.deleteConsult(c1);
  [proc] = await journal.procedures.getProcedures();
  assert.deepEqual(proc.consults.map((c) => c.epochDay), [19950]);
});

test('procedure recovery notes update independently of date/name', async () => {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);

  const id = await journal.procedures.upsertProcedure({ name: 'top surgery', surgeryEpochDay: 20000 });
  await journal.procedures.setNotes(id, 'feeling calm, bought supplies');

  const [proc] = await journal.procedures.getProcedures();
  assert.equal(proc.notes, 'feeling calm, bought supplies');
});

test('procedure recovery photos are stored under app-private file store and dated', async () => {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);

  const id = await journal.procedures.upsertProcedure({ name: 'top surgery', surgeryEpochDay: 20000 });
  const photo1 = await journal.procedures.addPhoto(id, 20002, { full: new Uint8Array([1, 2, 3]), thumb: new Uint8Array([1]) });
  const photo2 = await journal.procedures.addPhoto(id, 20010, { full: new Uint8Array([4, 5, 6]), thumb: new Uint8Array([4]) });

  const photos = await journal.procedures.getPhotos(id);
  assert.deepEqual(photos.map((p) => p.epochDay), [20002, 20010]);
  assert.equal(files.names().length, 4);

  await journal.procedures.deletePhoto(photo1);
  const remaining = await journal.procedures.getPhotos(id);
  assert.deepEqual(remaining.map((p) => p.id), [photo2]);
  assert.equal(files.names().length, 2);
});

test('procedure checklist is owned by the procedure and cleans up on delete', async () => {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);

  const id = await journal.procedures.upsertProcedure({ name: 'top surgery' });
  await journal.procedures.addChecklistItem(id, 'Buy scar tape');
  await journal.procedures.addChecklistItem(id, 'Arrange ride home');

  const checklist = await journal.procedures.getChecklist(id);
  assert.deepEqual(checklist?.items.map((i) => i.content), ['Buy scar tape', 'Arrange ride home']);

  await journal.procedures.deleteProcedure(id);
  assert.equal(await journal.procedures.getChecklist(id), undefined);
});

test('recording surgery day as a transition milestone links milestone to procedure (ADR-0045)', async () => {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);

  const id = await journal.procedures.upsertProcedure({ name: 'Top Surgery', surgeryEpochDay: 20000 });

  // No milestone linked initially
  assert.equal(await journal.procedures.getMilestone(id), null);

  // Record surgery day milestone
  const milestoneId = await journal.procedures.recordSurgeryMilestone(id);
  assert.ok(milestoneId);

  // Milestone is linked and retrievable through getMilestone
  const linked = await journal.procedures.getMilestone(id);
  assert.ok(linked);
  assert.equal(linked.id, milestoneId);
  assert.equal(linked.name, 'Top Surgery');
  assert.equal(linked.epochDay, 20000);
  assert.equal(linked.templateKey, 'surgery');
  assert.equal(linked.procedureId, id);

  // Also appears in general milestones list
  const allMilestones = await journal.milestones.getMilestones();
  const found = allMilestones.find((m) => m.id === milestoneId);
  assert.ok(found);
  assert.equal(found.procedureId, id);

  // Recording again updates the existing linked milestone rather than duplicating
  const sameId = await journal.procedures.recordSurgeryMilestone(id, { name: 'Top Surgery (Double Incision)' });
  assert.equal(sameId, milestoneId);
  const updatedLinked = await journal.procedures.getMilestone(id);
  assert.equal(updatedLinked?.name, 'Top Surgery (Double Incision)');

  // Deleting procedure unlinks the milestone without destroying historical milestone
  await journal.procedures.deleteProcedure(id);
  const postDeleteMilestones = await journal.milestones.getMilestones();
  const preserved = postDeleteMilestones.find((m) => m.id === milestoneId);
  assert.ok(preserved, 'milestone is preserved in timeline');
  assert.equal(preserved.procedureId, null, 'milestone procedure link is cleared');
});
