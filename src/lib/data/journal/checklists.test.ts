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

test('the debrief dismissal and entry link both read as absent until set', async () => {
  const { journal } = await journalWithBuiltIns();
  assert.equal(await journal.checklists.getDebriefEntryId('some-appointment'), null);
  assert.equal(await journal.checklists.getDebriefEntryId(null), null);
});

test('getDebriefState reads everything the offer predicate needs in one call', async () => {
  const { journal } = await journalWithBuiltIns();
  const appointmentId = await journal.appointments.upsertAppointment({
    epochDay: 19800,
    procedureId: null,
    kind: null,
    place: null,
    note: null
  });

  assert.deepEqual(await journal.checklists.getDebriefState(appointmentId), {
    appointmentId,
    itemCount: 0,
    dismissed: false,
    debriefEntryId: null
  });

  const entryId = await journal.entries.upsertEntry({ epochDay: 19801, mood: 3 });
  await journal.checklists.addToStandaloneChecklist('ask about labs');
  await journal.checklists.recordDebriefEntry(entryId, appointmentId);

  assert.deepEqual(await journal.checklists.getDebriefState(appointmentId), {
    appointmentId,
    itemCount: 1,
    dismissed: false,
    debriefEntryId: entryId
  });
});

test('a journal with no most recent past appointment gets no debrief offer', async () => {
  /* Phase 8 features ticket 49 item 6, rekeyed by ticket 58. Both halves of
     the gate are already tested apart - `getDebriefState` answers a null
     appointment id with itemCount/dismissed/debriefEntryId that all read
     as "nothing recorded" above, and `debriefOfferVisible` answers false
     to a null id in entryTemplates.test.ts - but nothing joined them, so
     nothing would notice a read that started defaulting the id, or a
     predicate that stopped checking it. The claim being kept is persona
     2's: a clinician-facing surface must not describe someone who has
     never had a clinician.

     Adding a prep question is deliberately not enough. Somebody can write
     down what they want to ask long before they have anywhere to ask it,
     and the offer stays silent until an appointment is actually on
     record. */
  const { journal } = await journalWithBuiltIns();

  assert.equal(debriefOfferVisible(await journal.checklists.getDebriefState(null)), false);

  await journal.checklists.addToStandaloneChecklist('ask about spironolactone');
  assert.equal(debriefOfferVisible(await journal.checklists.getDebriefState(null)), false);

  // The first appointment written is what arms it.
  const appointmentId = await journal.appointments.upsertAppointment({
    epochDay: 19800,
    procedureId: null,
    kind: null,
    place: null,
    note: null
  });
  assert.equal(debriefOfferVisible(await journal.checklists.getDebriefState(appointmentId)), true);
});

test('setDebriefDismissed records which appointment the offer was dismissed for', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.checklists.setDebriefDismissed('appt-1');

  const state = await journal.checklists.getDebriefState('appt-1');
  assert.equal(state.dismissed, true);
  assert.equal((await journal.checklists.getDebriefState('appt-2')).dismissed, false);
});

test('recordDebriefEntry links an entry to the appointment it names', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.checklists.addToStandaloneChecklist('ask about labs');
  const entryId = await journal.entries.upsertEntry({ epochDay: 19801, mood: 3 });
  await journal.checklists.recordDebriefEntry(entryId, 'appt-1');

  assert.equal(await journal.checklists.getDebriefEntryId('appt-1'), entryId);
});

test('recordDebriefEntry creates the standalone checklist when there is none yet', async () => {
  /* The link is state about the standalone checklist, so it needs a row to
     live in, and until ticket 58 the retired `setAppointmentDate` was what
     created one. Nothing in the app reaches here without a prep question
     already standing - the offer requires `itemCount > 0` - but the demo
     seed does (journal-seed.ts), and a silent zero-row UPDATE is the kind
     of thing that shows up as a persona whose debrief simply isn't there.
     `setDebriefDismissed`, the other writer of a debrief column, has
     created on first use all along. */
  const { journal } = await journalWithBuiltIns();
  const entryId = await journal.entries.upsertEntry({ epochDay: 19801, mood: 3 });
  await journal.checklists.recordDebriefEntry(entryId, 'appt-1');

  assert.equal(await journal.checklists.getDebriefEntryId('appt-1'), entryId);
});

test('a dismissal or entry link recorded for one appointment does not answer for another', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.checklists.addToStandaloneChecklist('ask about labs');
  const entryId = await journal.entries.upsertEntry({ epochDay: 19801, mood: 3 });
  await journal.checklists.setDebriefDismissed('appt-1');
  await journal.checklists.recordDebriefEntry(entryId, 'appt-1');

  // A newer past appointment becoming "the current one" (appointments.ts's
  // mostRecentPastAppointment moving forward) sees neither: the id-keyed
  // read is what replaces the old clear-on-date-change behaviour.
  assert.equal(await journal.checklists.getDebriefEntryId('appt-2'), null);
  const state = await journal.checklists.getDebriefState('appt-2');
  assert.equal(state.dismissed, false);
  assert.equal(state.debriefEntryId, null);

  // The original appointment's own dismissal and entry link are untouched.
  assert.equal(await journal.checklists.getDebriefEntryId('appt-1'), entryId);
  assert.equal((await journal.checklists.getDebriefState('appt-1')).dismissed, true);
});
