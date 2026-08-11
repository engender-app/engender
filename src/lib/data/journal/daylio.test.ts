/* Daylio import at the public journal seam: preview first, then one
   merge-only commit. The fixtures are files rather than inline strings
   because quoted multi-line notes are exactly where a hand-written CSV
   parser tends to split one Daylio row into two. */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'vitest';
import { dateInputValueFromEpochDay } from '../epochDay.ts';
import { journalWithBuiltIns } from './test-support.ts';

const fixture = (name: string) => readFile(new URL(`../archive/fixtures/${name}`, import.meta.url), 'utf8');

const naming = {
  tagLabels(id: string): string[] {
    return id === 'a-exercise' ? ['exercise', 'ruch'] : [];
  }
};

test('preview counts equal the merge, and importing the same Daylio CSV twice is a no-op', async () => {
  const { journal } = await journalWithBuiltIns();
  const existingEntry = await journal.entries.upsertEntry({ epochDay: 20_000, mood: 2, note: 'already here' });
  const foldedMatch = await journal.tags.addTag('activities', 'ćwiczenia');
  const csv = await fixture('daylio-edge-cases.csv');

  const preview = await journal.archive.previewDaylioImport(csv, naming);

  assert.equal(preview.entryCount, 3);
  assert.equal(preview.matchedTagCount, 2);
  assert.equal(preview.newTagCount, 2);
  assert.deepEqual(preview.moodMappings, [
    { label: 'Rad', mood: 5 },
    { label: 'Świetnie', mood: 5 }
  ]);
  assert.deepEqual(preview.unmappedMoodLabels, []);

  const committed = await journal.archive.commitDaylioImport(preview);
  assert.deepEqual(committed, { entriesAdded: preview.entryCount, tagsAdded: preview.newTagCount });
  assert.equal((await journal.entries.getEntry(existingEntry))?.note, 'already here');

  const imported = await journal.entries.recentDays(20);
  assert.equal(imported.length, 4);
  const first = imported.find((entry) => dateInputValueFromEpochDay(entry.epochDay) === '2026-01-15')!;
  assert.equal(first.mood, 5);
  assert.equal(first.note, 'A first\nTold them my name, out loud.\nShe said "finally".');
  assert.equal(new Date(first.timestamp).getHours(), 7);
  assert.equal(new Date(first.timestamp).getMinutes(), 15);
  assert.ok(first.tags.includes('a-exercise'));

  const second = imported.find((entry) => dateInputValueFromEpochDay(entry.epochDay) === '2026-01-16')!;
  assert.ok(second.tags.includes(foldedMatch.id), 'cwiczenia matches ćwiczenia through folded text');

  const emptyMood = imported.find((entry) => dateInputValueFromEpochDay(entry.epochDay) === '2026-01-17')!;
  assert.equal(emptyMood.mood, null);
  assert.equal(emptyMood.note, 'Quiet day');

  const importedGroup = (await journal.tags.getTagGroups()).find((group) => group.key === 'imported')!;
  assert.equal(importedGroup.name, '');
  assert.deepEqual(importedGroup.tags.map((tag) => tag.label).toSorted(), ['Gaming', 'Voice practice']);

  const beforeRepeat = (await journal.archive.snapshot()).journal;
  const repeatPreview = await journal.archive.previewDaylioImport(csv, naming);
  assert.equal(repeatPreview.entryCount, 0);
  assert.equal(repeatPreview.newTagCount, 0);
  assert.deepEqual(await journal.archive.commitDaylioImport(repeatPreview), { entriesAdded: 0, tagsAdded: 0 });
  assert.deepEqual((await journal.archive.snapshot()).journal, beforeRepeat);
});

test('an unmapped mood blocks commit and explains which label needs attention', async () => {
  const { journal } = await journalWithBuiltIns();
  const before = (await journal.archive.snapshot()).journal;
  const csv = [
    'full_date,date,weekday,time,mood,activities,note_title,note',
    '2026-01-15,January 15,Thursday,07:15,meh-ish,,,custom mood',
    '2026-01-16,January 16,Friday,07:15,Swietnie,,,looks like a default but is not its label'
  ].join('\n');

  const preview = await journal.archive.previewDaylioImport(csv, naming);

  assert.deepEqual(preview.moodMappings, [
    { label: 'meh-ish', mood: null },
    { label: 'Swietnie', mood: null }
  ]);
  assert.deepEqual(preview.unmappedMoodLabels, ['meh-ish', 'Swietnie']);
  await assert.rejects(journal.archive.commitDaylioImport(preview), /meh-ish.*Swietnie.*not mapped/i);
  assert.deepEqual((await journal.archive.snapshot()).journal, before);
});

test('every English and Polish default Daylio mood resolves to the five journal levels', async () => {
  const { journal } = await journalWithBuiltIns();
  const labels = [
    ['awful', 1],
    ['okropnie', 1],
    ['bad', 2],
    ['źle', 2],
    ['meh', 3],
    ['tak sobie', 3],
    ['good', 4],
    ['dobrze', 4],
    ['rad', 5],
    ['świetnie', 5]
  ] as const;
  const csv = [
    'full_date,date,weekday,time,mood,activities,note_title,note',
    ...labels.map(
      ([label], index) => `2026-01-${String(index + 1).padStart(2, '0')},,,07:15,${label},,,`
    )
  ].join('\n');

  const preview = await journal.archive.previewDaylioImport(csv, naming);

  assert.deepEqual(preview.moodMappings, labels.map(([label, mood]) => ({ label, mood })));
  assert.deepEqual(preview.unmappedMoodLabels, []);
});

test('a malformed Daylio CSV is rejected during preview, before anything is written', async () => {
  const { journal } = await journalWithBuiltIns();
  const before = (await journal.archive.snapshot()).journal;

  await assert.rejects(journal.archive.previewDaylioImport(await fixture('daylio-malformed.csv'), naming), /CSV.*quoted field/i);
  assert.deepEqual((await journal.archive.snapshot()).journal, before);
});