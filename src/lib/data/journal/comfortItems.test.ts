/* The comfort list area, exercised through the driver interface (phase 6
   ticket 14): minted uuids, insertion order, idempotent delete, reorder's
   permutation check. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns, UUID_PATTERN } from './test-support.ts';

test('an item gets a minted uuid id and comes back in the order it was added', async () => {
  const { journal } = await journalWithBuiltIns();
  const first = await journal.comfortItems.addItem('text a friend');
  const second = await journal.comfortItems.addItem('walk by the river');
  assert.match(first.id, UUID_PATTERN);

  const items = await journal.comfortItems.getItems();
  assert.deepEqual(items, [
    { id: first.id, text: 'text a friend' },
    { id: second.id, text: 'walk by the river' }
  ]);
});

test('editing an item addresses it by id and throws on an unknown one', async () => {
  const { journal } = await journalWithBuiltIns();
  const item = await journal.comfortItems.addItem('play that one playlist');
  await journal.comfortItems.editItem(item.id, 'play the calm playlist');

  const items = await journal.comfortItems.getItems();
  assert.equal(items.find((i) => i.id === item.id)?.text, 'play the calm playlist');

  await assert.rejects(journal.comfortItems.editItem('nope', 'x'), /unknown comfort item/);
});

test('deleting an item removes it; deleting twice is success', async () => {
  const { journal } = await journalWithBuiltIns();
  const item = await journal.comfortItems.addItem('text a friend');

  await journal.comfortItems.deleteItem(item.id);
  assert.deepEqual(await journal.comfortItems.getItems(), []);

  await journal.comfortItems.deleteItem(item.id); // idempotent
});

test('reorder takes the whole order and rejects anything that is not a permutation', async () => {
  const { journal } = await journalWithBuiltIns();
  const a = await journal.comfortItems.addItem('a');
  const b = await journal.comfortItems.addItem('b');
  const c = await journal.comfortItems.addItem('c');

  await journal.comfortItems.reorder([c.id, a.id, b.id]);
  assert.deepEqual((await journal.comfortItems.getItems()).map((i) => i.id), [c.id, a.id, b.id]);

  await assert.rejects(journal.comfortItems.reorder([a.id, b.id]), /permute/);
  await assert.rejects(journal.comfortItems.reorder([a.id, b.id, c.id, 'nope']), /permute/);
});
