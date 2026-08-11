/* The half of the reactive layer that has no runes in it, so it can be
   tested at all: which tables a journal mutation writes, and the wrapper
   that announces them (ticket 08). */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { journalWithBuiltIns } from '../journal/test-support.ts';
import type { Journal } from '../journal/journal.ts';
import { observeWrites, TABLE_NAMES, type TableName } from './writes.ts';

async function observed() {
  const { journal, db } = await journalWithBuiltIns();
  const announced: TableName[][] = [];
  return { journal: observeWrites(journal, (tables) => announced.push([...tables])), announced, db };
}

test('a write announces exactly the tables it touched, and hands its result back', async () => {
  const { journal, announced } = await observed();

  const id = await journal.entries.upsertEntry({ epochDay: 100, mood: 4 });

  assert.equal(typeof id, 'number');
  // Photos too, because a save carries additions and removals.
  assert.deepEqual(announced, [['entry', 'photo']]);
});

test('a photo write announces its owners, not just the photo table', async () => {
  const { journal, announced } = await observed();
  const entryId = await journal.entries.upsertEntry({ epochDay: 100, mood: 4 });
  announced.length = 0;

  /* An entry carries its photos on the shape it is read back as, so an entry
     list that watched only the entry table kept showing a photo indicator for
     a photo that had just been deleted. */
  const photoId = await journal.photos.attach(
    { entryId },
    { full: new Uint8Array([1]), thumb: new Uint8Array([2]) }
  );
  await journal.photos.remove(photoId);

  assert.deepEqual(announced, [
    ['photo', 'entry', 'milestone'],
    ['photo', 'entry', 'milestone']
  ]);
});

test('a milestone save announces photos because it can preserve, remove or replace one', async () => {
  const { journal, announced } = await observed();

  await journal.milestones.upsertMilestone({
    name: 'HRT start',
    epochDay: 90,
    photo: {
      action: 'replace',
      photo: { full: new Uint8Array([1]), thumb: new Uint8Array([2]) }
    }
  });

  assert.deepEqual(announced, [['milestone', 'photo']]);
});

test('a write that reaches into another area announces both', async () => {
  const { journal, announced } = await observed();
  const tag = await journal.tags.addTag('gender', 'voice practice');
  await journal.entries.upsertEntry({ epochDay: 100, tags: [tag.id] });
  announced.length = 0;

  // Deleting a custom tag unlinks it from every entry carrying it, so an
  // entry list that ignored the tag tables would still be stale.
  await journal.tags.deleteTag(tag.id);

  assert.deepEqual(announced, [['tag', 'entry']]);
});

test('deleting an entry or a milestone announces photos too, because it takes their rows', async () => {
  const { journal, announced } = await observed();
  const id = await journal.entries.upsertEntry({ epochDay: 100, mood: 4 });
  const milestoneId = await journal.milestones.upsertMilestone({ name: 'HRT start', epochDay: 90 });
  announced.length = 0;

  await journal.entries.deleteEntry(id);
  await journal.milestones.deleteMilestone(milestoneId);

  assert.deepEqual(announced, [
    ['entry', 'photo'],
    ['milestone', 'photo']
  ]);
});

test('reads announce nothing at all', async () => {
  const { journal, announced } = await observed();
  await journal.entries.upsertEntry({ epochDay: 100, mood: 4 });
  announced.length = 0;

  await journal.entries.entriesForDay(100);
  await journal.entries.recentDays(5);
  await journal.stats.streak(100);
  await journal.tags.getTagGroups();
  await journal.milestones.getMilestones();
  await journal.labs.getAnalytes();
  await journal.reminders.getReminders();
  await journal.dimensions.getPresets();
  await journal.photos.inJournal();

  assert.deepEqual(announced, []);
});

test('a rejected write announces nothing: nothing changed, so nothing is stale', async () => {
  const { journal, announced } = await observed();

  await assert.rejects(journal.entries.upsertEntry({ epochDay: 100, note: '   ' }), /needs a mood/);
  await assert.rejects(journal.milestones.upsertMilestone({ id: 'nope', name: 'x', epochDay: 1 }), /unknown/);

  assert.deepEqual(announced, []);
});

test('reconciling built-ins announces the reference tables it may have filled', async () => {
  const { journal, announced } = await observed();

  await journal.reconcileBuiltIns();

  assert.deepEqual(announced, [['tag', 'dimension', 'preset']]);
});

test('an import announces every table, because a restore rewrites the journal', async () => {
  const { journal, announced } = await observed();
  const snapshot = await journal.archive.snapshot();

  await journal.archive.merge({ journal: snapshot.journal, files: (async function* () {})() });

  assert.deepEqual(announced, [TABLE_NAMES]);
});

test('a Daylio preview commits through the observed journal the screen uses', async () => {
  const { journal, announced } = await observed();
  const csv = [
    'full_date,date,weekday,time,mood,activities,note_title,note',
    '2026-01-15,January 15,Thursday,07:15,Rad,,,from Daylio'
  ].join('\n');
  const preview = await journal.archive.previewDaylioImport(csv, { tagLabels: () => [] });

  const result = await journal.archive.commitDaylioImport(preview);

  assert.deepEqual(result, { entriesAdded: 1, tagsAdded: 0 });
  assert.deepEqual(announced, [TABLE_NAMES]);
});

test('an operation classified as neither read nor write is rejected on sight', async () => {
  const { journal } = await journalWithBuiltIns();
  (journal.entries as unknown as Record<string, unknown>).recountEverything = () => Promise.resolve();

  assert.throws(
    () => observeWrites(journal, () => {}),
    /entries\.recountEverything/,
    'a new journal method has to be classified, or the queries over it go stale in silence'
  );
});

test('every operation the journal actually has is classified', async () => {
  const { journal } = await journalWithBuiltIns();
  // The guard above, aimed at the real thing: this fails the moment an area
  // grows a method and writes.ts is not told about it.
  assert.doesNotThrow(() => observeWrites(journal, () => {}));

  // And the wrapper is a Journal, so nothing downstream needs to know it is
  // not the one openJournal() returned.
  const wrapped: Journal = observeWrites(journal, () => {});
  assert.deepEqual(Object.keys(wrapped).toSorted(), Object.keys(journal).toSorted());
});

test('a whole area this module does not know about is rejected too', async () => {
  const { journal } = await journalWithBuiltIns();
  (journal as unknown as Record<string, unknown>).exports = { toCsv: () => Promise.resolve('') };

  // Not just a nicer message: an unclassified area used to be dropped from
  // the wrapper silently, so `journal.exports` would have been undefined at
  // every call site that reached for it.
  assert.throws(() => observeWrites(journal, () => {}), /journal\.exports is an area/);
});
