/* pixels.ts's own tests, at the parsing/resolving seam - the same layer
   daylio.test.ts and transtracks.test.ts cover for their own sources.
   `pixels-edge-cases.json` and `pixels-malformed.json` are the committed
   fixture pair spec.md's Testing Decisions ask every source to ship, built
   the same way `daylio-edge-cases.csv` bundles several real scenarios into
   one file rather than one fixture per scenario. Narrower single-purpose
   cases stay inline, the same mix daylio.test.ts and transtracks.test.ts
   themselves use alongside their own fixtures. */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'vitest';
import { epochDayFromDateInputValue } from '../epochDay.ts';
import { emptyArchiveJournal } from '../journal/archiveSections.ts';
import { PixelsBackupError, detectPixels, pixelsPreview } from './pixels.ts';

const fixtureBytes = async (name: string): Promise<Uint8Array> =>
  new Uint8Array(await readFile(new URL(`fixtures/${name}`, import.meta.url)));

const backup = (records: unknown[]): Uint8Array => new TextEncoder().encode(JSON.stringify(records));

const record = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  date: '2026-01-01',
  type: 'MOOD',
  scores: [3],
  notes: '',
  tags: [],
  ...overrides
});

const empty = () => emptyArchiveJournal();

test('detectPixels sniffs a bare array of date/type records, so a malformed body still detects as Pixels', async () => {
  const wellFormed = await fixtureBytes('pixels-edge-cases.json');
  const malformed = await fixtureBytes('pixels-malformed.json');

  assert.ok(detectPixels(wellFormed));
  assert.ok(detectPixels(malformed));
  // An empty export is still Pixels' own shape.
  assert.ok(detectPixels(new TextEncoder().encode('[]')));

  assert.ok(!detectPixels(new TextEncoder().encode('not json at all')));
  assert.ok(!detectPixels(new TextEncoder().encode('{"date":"2026-01-01","type":"MOOD"}')));
  assert.ok(!detectPixels(new TextEncoder().encode('[{"foo":1}]')));
});

test('the well-formed fixture: four records import, HABIT is named and skipped, and the multi-score record averages', async () => {
  const preview = await pixelsPreview(await fixtureBytes('pixels-edge-cases.json'), empty());

  assert.equal(preview.entryCount, 4);
  assert.deepEqual(preview.unrecognizedTypes, ['HABIT']);
  assert.equal(preview.averagedRecordCount, 1);
  assert.equal(preview.newTagCount, 9);
  assert.equal(preview.matchedTagCount, 0);

  assert.deepEqual(
    preview.journal.tagGroups.map((group) => group.name).toSorted(),
    ['Activities', 'Cycle', 'Emotions', 'Symptoms', 'Weather']
  );
  for (const group of preview.journal.tagGroups) {
    assert.notEqual(group.key, group.name.toLowerCase(), `${group.name}'s key must not collide with a built-in group`);
    assert.equal(group.builtIn, false);
  }

  const multiScore = preview.journal.entries.find((entry) => entry.epochDay === epochDayFromDateInputValue('2026-09-03'))!;
  assert.equal(multiScore.mood, 4, 'scores [3, 5] average to 3.5, rounded to 4');
});

test('the malformed fixture: an invalid date is refused by name', async () => {
  await assert.rejects(
    pixelsPreview(await fixtureBytes('pixels-malformed.json'), empty()),
    (error: unknown) => error instanceof PixelsBackupError && /record 0.*invalid date/i.test((error as Error).message)
  );
});

test('re-importing the well-formed fixture a second time adds nothing', async () => {
  const bytes = await fixtureBytes('pixels-edge-cases.json');

  const first = await pixelsPreview(bytes, empty());
  const second = await pixelsPreview(bytes, first.journal);

  assert.equal(second.entryCount, 0);
  assert.equal(second.newTagCount, 0);
  assert.equal(second.matchedTagCount, 9);
  assert.deepEqual(second.journal.entries, []);
});

test('2026-9-1 parses to the right day, and Daylio\'s strict zero-padded pattern is not what accepts it', async () => {
  assert.ok(!/^\d{4}-\d{2}-\d{2}$/.test('2026-9-1'));
  const preview = await pixelsPreview(backup([record({ date: '2026-9-1' })]), empty());
  assert.equal(preview.journal.entries[0].epochDay, epochDayFromDateInputValue('2026-09-01'));
});

test('an invalid date such as 2026-13-1 is a named structural error', async () => {
  await assert.rejects(
    pixelsPreview(backup([record({ date: '2026-13-1' })]), empty()),
    (error: unknown) => error instanceof PixelsBackupError && /invalid date/i.test((error as Error).message)
  );
});

test('an invalid scores value is a named structural error, not a silent first-element read', async () => {
  await assert.rejects(
    pixelsPreview(backup([record({ scores: [] })]), empty()),
    (error: unknown) => error instanceof PixelsBackupError && /scores/i.test((error as Error).message)
  );
  await assert.rejects(pixelsPreview(backup([record({ scores: 'not-an-array' })]), empty()), PixelsBackupError);
});

test('a scores array with more than one element averages, rounded to the nearest whole number, and is counted', async () => {
  const preview = await pixelsPreview(backup([record({ scores: [3, 4] })]), empty());
  assert.equal(preview.journal.entries[0].mood, 4);
  assert.equal(preview.averagedRecordCount, 1);
});

test('an unrecognised type is named in the preview and skipped, not fatal', async () => {
  const preview = await pixelsPreview(backup([record(), record({ date: '2026-01-02', type: 'HABIT' })]), empty());
  assert.equal(preview.entryCount, 1);
  assert.deepEqual(preview.unrecognizedTypes, ['HABIT']);
});

test('a record with no notes and no tags still imports - Daylio\'s empty-row guard does not apply here', async () => {
  const preview = await pixelsPreview(backup([record({ notes: '', tags: [] })]), empty());
  assert.equal(preview.entryCount, 1);
});

test('an unknown tag group type imports as its own tag group, named from the file rather than dropped', async () => {
  const preview = await pixelsPreview(
    backup([record({ tags: [{ type: 'Weather', entries: ['Rain'] }] })]),
    empty()
  );
  const group = preview.journal.tagGroups.find((g) => g.name === 'Weather');
  assert.ok(group);
  assert.deepEqual(group!.tags.map((tag) => tag.label), ['Rain']);
});

test('a Pixels tag group is namespaced away from this app\'s own built-in emotions/activities groups', async () => {
  const preview = await pixelsPreview(
    backup([record({ tags: [{ type: 'Emotions', entries: ['Grateful'] }] })]),
    empty()
  );
  const group = preview.journal.tagGroups.find((g) => g.name === 'Emotions')!;
  assert.notEqual(group.key, 'emotions');
});

test('two identical records produce the same content uuid, so a repeat import matches by content, not position', async () => {
  const bytes = backup([record({ notes: 'same' })]);
  const first = await pixelsPreview(bytes, empty());
  const second = await pixelsPreview(bytes, empty());
  assert.equal(first.journal.entries[0].uuid, second.journal.entries[0].uuid);
});
