/* The tags area, exercised through the driver interface (ticket 07):
   id-or-key addressing only, F17's hide/delete asymmetry, loud failures
   on unknown write ids, idempotent deletes. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns, UUID_PATTERN } from './test-support.ts';

test('a custom tag gets a minted uuid id, never a Date-based one', async () => {
  const { journal } = await journalWithBuiltIns();
  const tag = await journal.tags.addTag('emotions', 'proud');
  assert.match(tag.id, UUID_PATTERN);

  const groups = await journal.tags.getTagGroups();
  const emotions = groups.find((g) => g.key === 'emotions')!;
  const stored = emotions.tags.find((t) => t.id === tag.id);
  assert.deepEqual(stored, { id: tag.id, label: 'proud', builtIn: false, hidden: false });
});

test('rename and hide address a tag by id and throw on an unknown one', async () => {
  const { journal } = await journalWithBuiltIns();
  const tag = await journal.tags.addTag('emotions', 'prowd');
  await journal.tags.renameTag(tag.id, 'proud');
  await journal.tags.setTagHidden('e-happy', true);

  const emotions = (await journal.tags.getTagGroups()).find((g) => g.key === 'emotions')!;
  assert.equal(emotions.tags.find((t) => t.id === tag.id)?.label, 'proud');
  assert.equal(emotions.tags.find((t) => t.id === 'e-happy')?.hidden, true);

  await assert.rejects(journal.tags.renameTag('nope', 'x'), /unknown tag/);
  await assert.rejects(journal.tags.setTagHidden('nope', true), /unknown tag/);
});

test('hiding a built-in tag preserves the entries that carry it', async () => {
  const { journal } = await journalWithBuiltIns();
  const entryId = await journal.entries.upsertEntry({ epochDay: 100, mood: 3, tags: ['e-happy'] });

  await journal.tags.setTagHidden('e-happy', true);

  const entry = await journal.entries.getEntry(entryId);
  assert.deepEqual(entry?.tags, ['e-happy']);
});

test('deleting a custom tag removes its entry links; deleting twice is success', async () => {
  const { journal, db } = await journalWithBuiltIns();
  const tag = await journal.tags.addTag('emotions', 'proud');
  const entryId = await journal.entries.upsertEntry({ epochDay: 100, mood: 4, tags: [tag.id] });

  await journal.tags.deleteTag(tag.id);

  const entry = await journal.entries.getEntry(entryId);
  assert.deepEqual(entry?.tags, []);
  assert.equal((db.raw.prepare('SELECT COUNT(*) AS n FROM entry_tag').get() as { n: number }).n, 0);

  await journal.tags.deleteTag(tag.id); // idempotent
});

test('a built-in tag cannot be deleted', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(journal.tags.deleteTag('e-happy'), /hide, not delete/);
});

test('reorder takes the whole order and rejects anything that is not a permutation', async () => {
  const { journal } = await journalWithBuiltIns();
  const before = (await journal.tags.getTagGroups()).find((g) => g.key === 'emotions')!.tags.map((t) => t.id);

  const reversed = [...before].reverse();
  await journal.tags.reorder('emotions', reversed);
  const after = (await journal.tags.getTagGroups()).find((g) => g.key === 'emotions')!.tags.map((t) => t.id);
  assert.deepEqual(after, reversed);

  await assert.rejects(journal.tags.reorder('emotions', reversed.slice(1)), /permute/);
  await assert.rejects(journal.tags.reorder('nope', reversed), /unknown tag group/);
});

test('a custom group is created enabled, keyed by its minted uuid', async () => {
  const { journal } = await journalWithBuiltIns();
  const group = await journal.tags.addGroup('Hobbies');

  const stored = (await journal.tags.getTagGroups()).find((g) => g.key === group.key);
  assert.deepEqual(stored, { key: group.key, name: 'Hobbies', enabled: true, builtIn: false, tags: [] });

  await journal.tags.setGroupEnabled(group.key, false);
  assert.equal((await journal.tags.getTagGroups()).find((g) => g.key === group.key)?.enabled, false);
  await assert.rejects(journal.tags.setGroupEnabled('nope', true), /unknown tag group/);
});
