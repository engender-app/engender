/* The checklists area, exercised through the driver interface (ticket 05):
   standalone and owned checklists sharing one schema, add/edit/check/
   uncheck/delete/reorder, loud failures on unknown ids, idempotent deletes. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns, UUID_PATTERN } from './test-support.ts';
import { debriefOfferVisible } from '../vocabulary/entryTemplates.ts';

test('a standalone checklist starts empty with no owner', async () => {
  const { journal } = await journalWithBuiltIns();
  const checklist = await journal.checklists.createChecklist();
  assert.match(checklist.id, UUID_PATTERN);
  assert.deepEqual(checklist, { id: checklist.id, owner: null, items: [] });

  const stored = await journal.checklists.getChecklist(checklist.id);
  assert.deepEqual(stored, checklist);
});

test('an owned checklist is findable by its owner and shares the same schema as a standalone one', async () => {
  const { journal } = await journalWithBuiltIns();
  const owner = { kind: 'procedure', id: 'p-1' };
  const checklist = await journal.checklists.createChecklist(owner);

  assert.deepEqual(checklist.owner, owner);
  const byOwner = await journal.checklists.getChecklistByOwner(owner);
  assert.deepEqual(byOwner, checklist);
  assert.equal(await journal.checklists.getChecklistByOwner({ kind: 'procedure', id: 'nope' }), undefined);
});

test('an unknown checklist id reads as undefined', async () => {
  const { journal } = await journalWithBuiltIns();
  assert.equal(await journal.checklists.getChecklist('nope'), undefined);
});

test('items are added with a minted uuid, appended in order', async () => {
  const { journal } = await journalWithBuiltIns();
  const checklist = await journal.checklists.createChecklist();

  const first = await journal.checklists.addItem(checklist.id, 'buy gauze');
  const second = await journal.checklists.addItem(checklist.id, 'fill prescription');
  assert.match(first.id, UUID_PATTERN);
  assert.deepEqual(first, { id: first.id, content: 'buy gauze', checked: false, carriedForward: false });

  const stored = await journal.checklists.getChecklist(checklist.id);
  assert.deepEqual(
    stored?.items.map((i) => i.id),
    [first.id, second.id]
  );
});

test('addItem throws on an unknown checklist', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(journal.checklists.addItem('nope', 'x'));
});

test('edit, check, uncheck and carry-forward address an item by id and throw on an unknown one', async () => {
  const { journal } = await journalWithBuiltIns();
  const checklist = await journal.checklists.createChecklist();
  const item = await journal.checklists.addItem(checklist.id, 'buy gauze');

  await journal.checklists.editItem(item.id, 'buy more gauze');
  await journal.checklists.setItemChecked(item.id, true);
  await journal.checklists.setItemCarriedForward(item.id, true);

  const stored = (await journal.checklists.getChecklist(checklist.id))?.items[0];
  assert.deepEqual(stored, { id: item.id, content: 'buy more gauze', checked: true, carriedForward: true });

  await journal.checklists.setItemChecked(item.id, false);
  assert.equal((await journal.checklists.getChecklist(checklist.id))?.items[0].checked, false);

  await assert.rejects(journal.checklists.editItem('nope', 'x'), /unknown checklist item/);
  await assert.rejects(journal.checklists.setItemChecked('nope', true), /unknown checklist item/);
  await assert.rejects(journal.checklists.setItemCarriedForward('nope', true), /unknown checklist item/);
});

test('deleting an item removes it; deleting twice is success', async () => {
  const { journal } = await journalWithBuiltIns();
  const checklist = await journal.checklists.createChecklist();
  const item = await journal.checklists.addItem(checklist.id, 'buy gauze');

  await journal.checklists.deleteItem(item.id);
  assert.deepEqual((await journal.checklists.getChecklist(checklist.id))?.items, []);

  await journal.checklists.deleteItem(item.id); // idempotent
});

test('deleting a checklist takes its items along; deleting twice is success', async () => {
  const { journal, db } = await journalWithBuiltIns();
  const checklist = await journal.checklists.createChecklist();
  await journal.checklists.addItem(checklist.id, 'buy gauze');

  await journal.checklists.deleteChecklist(checklist.id);

  assert.equal(await journal.checklists.getChecklist(checklist.id), undefined);
  assert.equal((db.raw.prepare('SELECT COUNT(*) AS n FROM checklist_item').get() as { n: number }).n, 0);

  await journal.checklists.deleteChecklist(checklist.id); // idempotent
});

test('reorder takes the whole order and rejects anything that is not a permutation', async () => {
  const { journal } = await journalWithBuiltIns();
  const checklist = await journal.checklists.createChecklist();
  const a = await journal.checklists.addItem(checklist.id, 'a');
  const b = await journal.checklists.addItem(checklist.id, 'b');
  const c = await journal.checklists.addItem(checklist.id, 'c');

  const reversed = [c.id, b.id, a.id];
  await journal.checklists.reorder(checklist.id, reversed);
  const after = (await journal.checklists.getChecklist(checklist.id))?.items.map((i) => i.id);
  assert.deepEqual(after, reversed);

  await assert.rejects(journal.checklists.reorder(checklist.id, [a.id, b.id]), /permute/);
  await assert.rejects(journal.checklists.reorder('nope', reversed));
});

test('with no standalone checklist created yet, getStandaloneChecklist reads as undefined', async () => {
  const { journal } = await journalWithBuiltIns();
  assert.equal(await journal.checklists.getStandaloneChecklist(), undefined);
});

test('an owned checklist never answers as the standalone one', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.checklists.createChecklist({ kind: 'procedure', id: 'p-1' });
  assert.equal(await journal.checklists.getStandaloneChecklist(), undefined);
});

test('addToStandaloneChecklist creates the standalone checklist on first use', async () => {
  const { journal } = await journalWithBuiltIns();
  const item = await journal.checklists.addToStandaloneChecklist('ask about spironolactone dose');

  assert.match(item.id, UUID_PATTERN);
  assert.deepEqual(item, { id: item.id, content: 'ask about spironolactone dose', checked: false, carriedForward: false });

  const checklist = await journal.checklists.getStandaloneChecklist();
  assert.equal(checklist?.owner, null);
  assert.deepEqual(checklist?.items, [item]);
});

test('addToStandaloneChecklist reuses the same checklist on later calls', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.checklists.addToStandaloneChecklist('first question');
  await journal.checklists.addToStandaloneChecklist('second question');

  const checklist = await journal.checklists.getStandaloneChecklist();
  assert.deepEqual(
    checklist?.items.map((i) => i.content),
    ['first question', 'second question']
  );
});

test('the appointment date is null until set, and setAppointmentDate creates the standalone checklist on first use', async () => {
  const { journal } = await journalWithBuiltIns();
  assert.equal(await journal.checklists.getAppointmentDate(), null);
  assert.equal(await journal.checklists.getStandaloneChecklist(), undefined);

  await journal.checklists.setAppointmentDate(19800);

  assert.equal(await journal.checklists.getAppointmentDate(), 19800);
  const checklist = await journal.checklists.getStandaloneChecklist();
  assert.equal(checklist?.owner, null);
  assert.deepEqual(checklist?.items, []);
});

test('setAppointmentDate on an existing standalone checklist replaces the date and leaves its items alone', async () => {
  const { journal } = await journalWithBuiltIns();
  const item = await journal.checklists.addToStandaloneChecklist('ask about labs');
  await journal.checklists.setAppointmentDate(19800);
  await journal.checklists.setAppointmentDate(19830);

  assert.equal(await journal.checklists.getAppointmentDate(), 19830);
  const checklist = await journal.checklists.getStandaloneChecklist();
  assert.deepEqual(checklist?.items, [item]);
});

test('setAppointmentDate(null) clears a previously set date', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.checklists.setAppointmentDate(19800);
  await journal.checklists.setAppointmentDate(null);
  assert.equal(await journal.checklists.getAppointmentDate(), null);
});

test('an owned checklist never carries the appointment date', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.checklists.createChecklist({ kind: 'procedure', id: 'p-1' });
  await journal.checklists.setAppointmentDate(19800);

  const owned = await journal.checklists.getChecklistByOwner({ kind: 'procedure', id: 'p-1' });
  assert.equal(owned?.owner?.id, 'p-1');
  assert.equal(await journal.checklists.getAppointmentDate(), 19800);
});

test('the debrief dismissal and entry link are both null until set', async () => {
  const { journal } = await journalWithBuiltIns();
  assert.equal(await journal.checklists.getDebriefDismissedEpochDay(), null);
  assert.equal(await journal.checklists.getDebriefEntryId(), null);
});

test('getDebriefState reads everything the offer predicate needs in one call', async () => {
  const { journal } = await journalWithBuiltIns();
  assert.deepEqual(await journal.checklists.getDebriefState(), {
    appointmentEpochDay: null,
    itemCount: 0,
    dismissedEpochDay: null,
    debriefEntryId: null
  });

  const entryId = await journal.entries.upsertEntry({ epochDay: 19801, mood: 3 });
  await journal.checklists.addToStandaloneChecklist('ask about labs');
  await journal.checklists.setAppointmentDate(19800);
  await journal.checklists.recordDebriefEntry(entryId, 19800);

  assert.deepEqual(await journal.checklists.getDebriefState(), {
    appointmentEpochDay: 19800,
    itemCount: 1,
    dismissedEpochDay: null,
    debriefEntryId: entryId
  });
});

test('a journal that has never written an appointment gets no debrief offer', async () => {
  /* Phase 8 features ticket 49 item 6. Both halves of the gate are already
     tested apart - `getDebriefState` returns nulls above, and
     `debriefOfferVisible` answers false to a null date in
     entryTemplates.test.ts - but nothing joined them, so nothing would
     notice a read that started defaulting the date to today, or a predicate
     that stopped checking it. The claim being kept is persona 2's: a
     clinician-facing surface must not describe someone who has never had a
     clinician.

     Adding a prep question is deliberately not enough. Somebody can write
     down what they want to ask long before they have anywhere to ask it,
     and the offer stays silent until a date is actually on record. */
  const { journal } = await journalWithBuiltIns();
  const today = 19900;

  assert.equal(debriefOfferVisible({ ...(await journal.checklists.getDebriefState()), todayEpochDay: today }), false);

  await journal.checklists.addToStandaloneChecklist('ask about spironolactone');
  assert.equal(debriefOfferVisible({ ...(await journal.checklists.getDebriefState()), todayEpochDay: today }), false);

  // The first appointment written is what arms it, once that day has passed.
  await journal.checklists.setAppointmentDate(today - 1);
  assert.equal(debriefOfferVisible({ ...(await journal.checklists.getDebriefState()), todayEpochDay: today }), true);

  // Clearing the date back to "no appointment on record" silences it again.
  await journal.checklists.setAppointmentDate(null);
  assert.equal(debriefOfferVisible({ ...(await journal.checklists.getDebriefState()), todayEpochDay: today }), false);
});

test('setDebriefDismissed records which date the offer was dismissed for', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.checklists.setAppointmentDate(19800);
  await journal.checklists.setDebriefDismissed(19800);

  assert.equal(await journal.checklists.getDebriefDismissedEpochDay(), 19800);
});

test('recordDebriefEntry links an entry to the appointment currently on record', async () => {
  const { journal } = await journalWithBuiltIns();
  const entryId = await journal.entries.upsertEntry({ epochDay: 19801, mood: 3 });
  await journal.checklists.setAppointmentDate(19800);
  await journal.checklists.recordDebriefEntry(entryId, 19800);

  assert.equal(await journal.checklists.getDebriefEntryId(), entryId);
});

test('recordDebriefEntry is a no-op once the appointment has moved on', async () => {
  const { journal } = await journalWithBuiltIns();
  const entryId = await journal.entries.upsertEntry({ epochDay: 19801, mood: 3 });
  await journal.checklists.setAppointmentDate(19800);
  await journal.checklists.setAppointmentDate(19830);
  await journal.checklists.recordDebriefEntry(entryId, 19800);

  assert.equal(await journal.checklists.getDebriefEntryId(), null);
});

test('changing the appointment date clears a stale dismissal and entry link', async () => {
  const { journal } = await journalWithBuiltIns();
  const entryId = await journal.entries.upsertEntry({ epochDay: 19801, mood: 3 });
  await journal.checklists.setAppointmentDate(19800);
  await journal.checklists.setDebriefDismissed(19800);
  await journal.checklists.recordDebriefEntry(entryId, 19800);

  await journal.checklists.setAppointmentDate(19830);

  assert.equal(await journal.checklists.getDebriefDismissedEpochDay(), null);
  assert.equal(await journal.checklists.getDebriefEntryId(), null);
});

test('setting the same appointment date again leaves the dismissal and entry link alone', async () => {
  const { journal } = await journalWithBuiltIns();
  const entryId = await journal.entries.upsertEntry({ epochDay: 19801, mood: 3 });
  await journal.checklists.setAppointmentDate(19800);
  await journal.checklists.setDebriefDismissed(19800);
  await journal.checklists.recordDebriefEntry(entryId, 19800);

  await journal.checklists.setAppointmentDate(19800);

  assert.equal(await journal.checklists.getDebriefDismissedEpochDay(), 19800);
  assert.equal(await journal.checklists.getDebriefEntryId(), entryId);
});
