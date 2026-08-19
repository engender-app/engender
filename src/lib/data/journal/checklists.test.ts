/* The checklists area, exercised through the driver interface (ticket 05):
   standalone and owned checklists sharing one schema, add/edit/check/
   uncheck/delete/reorder, loud failures on unknown ids, idempotent deletes. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns, UUID_PATTERN } from './test-support.ts';

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
