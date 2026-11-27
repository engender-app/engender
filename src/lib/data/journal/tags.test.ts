/* The tags area, exercised through the driver interface (ticket 07):
   id-or-key addressing only, F17's hide/delete asymmetry, loud failures
   on unknown write ids, idempotent deletes. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { toggleTag } from '../vocabulary/emotionFamilies.ts';
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

test('the dysphoria type group is seeded built-in, and hides like any other built-in tag', async () => {
  const { journal } = await journalWithBuiltIns();

  const dysphoriaType = (await journal.tags.getTagGroups()).find((g) => g.key === 'dysphoria_type')!;
  assert.equal(dysphoriaType.builtIn, true);
  assert.deepEqual(
    dysphoriaType.tags.map((t) => t.id),
    ['dt-physical', 'dt-biochemical', 'dt-social', 'dt-societal', 'dt-sexual', 'dt-presentational', 'dt-existential']
  );
  assert.ok(dysphoriaType.tags.every((t) => t.builtIn && !t.hidden));

  await journal.tags.setTagHidden('dt-social', true);
  const afterHide = (await journal.tags.getTagGroups()).find((g) => g.key === 'dysphoria_type')!;
  assert.equal(afterHide.tags.find((t) => t.id === 'dt-social')?.hidden, true);
  await assert.rejects(journal.tags.deleteTag('dt-social'), /hide, not delete/);
});

test('the euphoria tag is usable on its own, on the same entry as a dysphoria type, or on neither', async () => {
  const { journal } = await journalWithBuiltIns();

  const euphoriaOnly = await journal.entries.upsertEntry({ epochDay: 100, mood: 4, tags: ['g-euphoria'] });
  const dysphoriaOnly = await journal.entries.upsertEntry({ epochDay: 101, mood: 2, tags: ['dt-existential'] });
  const both = await journal.entries.upsertEntry({ epochDay: 102, mood: 3, tags: ['g-euphoria', 'dt-social'] });

  assert.deepEqual((await journal.entries.getEntry(euphoriaOnly))?.tags, ['g-euphoria']);
  assert.deepEqual((await journal.entries.getEntry(dysphoriaOnly))?.tags, ['dt-existential']);
  assert.deepEqual((await journal.entries.getEntry(both))?.tags, ['g-euphoria', 'dt-social']);
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

/* Pre-release-human 22: a person's own tag can carry an icon. */

test('an own tag takes an icon when added, changes it, and drops it back to none', async () => {
  const { journal } = await journalWithBuiltIns();
  const tag = await journal.tags.addTag('activities', 'climbing', 'mountain');
  assert.deepEqual(tag, { id: tag.id, label: 'climbing', builtIn: false, hidden: false, icon: 'mountain' });
  const read = async () => (await journal.tags.getTagGroups()).flatMap((g) => g.tags).find((t) => t.id === tag.id);
  assert.equal((await read())?.icon, 'mountain');

  await journal.tags.editOwnTag(tag.id, { label: 'cycling', icon: 'bike' });
  assert.deepEqual(await read(), { id: tag.id, label: 'cycling', builtIn: false, hidden: false, icon: 'bike' });
  await journal.tags.editOwnTag(tag.id, { label: 'biking' });
  assert.equal((await read())?.icon, 'bike');
  await journal.tags.editOwnTag(tag.id, { icon: null });
  assert.deepEqual(await read(), { id: tag.id, label: 'biking', builtIn: false, hidden: false });

  await assert.rejects(journal.tags.editOwnTag('nope', { icon: 'bike' }), /unknown own tag/);
});

test('a built-in tag keeps the icon this build gives it; none is stored', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(journal.tags.editOwnTag('e-happy', { icon: 'bike' }), /unknown own tag/);
  assert.equal((await journal.tags.getTagGroups()).flatMap((g) => g.tags).find((t) => t.id === 'e-happy')?.icon, undefined);
});

test('an own tag\'s icon travels in an archive, and an archive with no icons restores without them', async () => {
  const a = await journalWithBuiltIns();
  const withIcon = await a.journal.tags.addTag('activities', 'climbing', 'mountain');
  const without = await a.journal.tags.addTag('activities', 'reading');
  const snapshot = await a.journal.archive.snapshot();
  const archived = JSON.parse(JSON.stringify(snapshot.journal)) as typeof snapshot.journal;
  const tags = archived.tagGroups.flatMap((g) => g.tags);
  assert.equal(tags.find((t) => t.id === withIcon.id)?.icon, 'mountain');
  assert.equal('icon' in tags.find((t) => t.id === without.id)!, false);

  const restore = async (journal: typeof archived) => {
    const b = await journalWithBuiltIns();
    await b.journal.archive.replace({ journal, files: (async function* () {})() });
    return (await b.journal.tags.getTagGroups()).flatMap((g) => g.tags);
  };
  assert.equal((await restore(archived)).find((t) => t.id === withIcon.id)?.icon, 'mountain');

  const older = structuredClone(archived);
  for (const t of older.tagGroups.flatMap((g) => g.tags)) delete (t as { icon?: string }).icon;
  const restored = await restore(older);
  assert.equal(restored.find((t) => t.id === withIcon.id)?.icon, undefined);
  assert.equal(restored.find((t) => t.id === without.id)?.label, 'reading');
});

test('a restore refuses an icon that is not a name', async () => {
  const a = await journalWithBuiltIns();
  const tag = await a.journal.tags.addTag('activities', 'climbing', 'mountain');
  const archived = JSON.parse(JSON.stringify((await a.journal.archive.snapshot()).journal));
  archived.tagGroups.flatMap((g: { tags: { id: string; icon?: unknown }[] }) => g.tags).find((t: { id: string }) => t.id === tag.id).icon = 42;
  const b = await journalWithBuiltIns();
  await assert.rejects(b.journal.archive.replace({ journal: archived, files: (async function* () {})() }));
});

test('a finer emotion reaches the scale comparison, tag share and search', async () => {
  const { journal } = await journalWithBuiltIns();
  const tags = toggleTag([], 'e-overwhelmed');
  const finer = [];
  for (const epochDay of [100, 101, 102]) {
    finer.unshift(await journal.entries.upsertEntry({ epochDay, mood: 2, dims: { femininity: 10 }, tags }));
  }
  await journal.entries.upsertEntry({ epochDay: 103, mood: 4, dims: { femininity: 90 }, tags: ['e-anxious'] });
  await journal.entries.upsertEntry({ epochDay: 104, mood: 4, dims: { femininity: 90 } });

  const insights = await journal.stats.tagInsights('femininity', 100, 104);
  assert.deepEqual(insights.find((row) => row.id === 'e-overwhelmed'), {
    id: 'e-overwhelmed', count: 3, withAvg: 10, withoutAvg: 90
  });
  assert.deepEqual(await journal.stats.tagShare(100, 104), [
    { id: 'e-anxious', count: 4 }, { id: 'e-overwhelmed', count: 3 }
  ]);
  const hits = await journal.entries.searchEntries('', [], { tagIds: ['e-overwhelmed'] });
  assert.deepEqual(hits.map((entry) => entry.id), finer);
});
