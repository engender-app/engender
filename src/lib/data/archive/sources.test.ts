/* The registry itself: that recognition runs the real per-source `detect`
   rather than a name lookup, and that a file nothing recognises is declined
   without any source's `preview` ever being reached.

   What Daylio itself does with a recognised file is not re-tested here -
   that is daylio.ts's own journal.test.ts, which this ticket leaves
   unchanged. */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'vitest';
import { emptyArchiveJournal } from '../journal/archiveSections.ts';
import { daylioPreview, detectDaylio } from './daylio.ts';
import { ARCHIVE_SOURCES, UnrecognizedArchiveSourceError, recognizeSource, requireSource, type ArchiveSource } from './sources.ts';

const fixture = (name: string) => readFile(new URL(`fixtures/${name}`, import.meta.url), 'utf8');

const stub = (name: string, detect: (text: string) => boolean): ArchiveSource => ({
  name: name as ArchiveSource['name'],
  requiredColumns: [],
  detect,
  async preview() {
    throw new Error(`${name} stub preview should never be called`);
  }
});

const daylioEntry = ARCHIVE_SOURCES.find((source) => source.name === 'daylio')!;

test('the daylio entry is registered, carrying its own required columns', () => {
  assert.equal(ARCHIVE_SOURCES.length, 1);
  assert.deepEqual(daylioEntry.requiredColumns, ['full_date', 'time', 'mood', 'activities', 'note_title', 'note']);
});

test('recognizeSource runs each candidate\'s real detect, not a name filter', async () => {
  const csv = await fixture('daylio-edge-cases.csv');
  const other = stub('other', (text) => text.includes('MARKER'));
  const shortened = [other, daylioEntry];

  // A stub that would match everything is not enough to fool this: only the
  // one whose own detect actually returns true for this text is picked.
  assert.equal(recognizeSource(csv, shortened), daylioEntry);
  assert.equal(recognizeSource('MARKER,anything\n1,2', shortened), other);
  assert.equal(recognizeSource('nothing here matches either one', shortened), null);
});

test('a file matching no source is declined by name, with no preview attempted', () => {
  const other = stub('other', () => false);
  assert.throws(() => requireSource('not a known file shape', [other]), UnrecognizedArchiveSourceError);
});

test('detectDaylio sniffs the header alone, so a malformed body still detects as Daylio', async () => {
  const wellFormed = await fixture('daylio-edge-cases.csv');
  const malformed = await fixture('daylio-malformed.csv');

  assert.ok(detectDaylio(wellFormed));
  assert.ok(detectDaylio(malformed));
  assert.ok(!detectDaylio('name,unrelated,columns\nA,B,C'));
});

// New tag ids are minted at random (mintUuid), so two independent calls
// resolve the same tags under different ids. Comparing by label rather than
// id is what proves the registry's `preview` wires up daylioPreview rather
// than reimplementing it, without depending on that randomness.
function byLabel(journal: Awaited<ReturnType<typeof daylioPreview>>['journal']) {
  const labelOf = new Map(journal.tagGroups.flatMap((group) => group.tags.map((tag) => [tag.id, tag.label] as const)));
  return {
    entries: journal.entries.map((entry) => ({ ...entry, tags: entry.tags.map((id) => labelOf.get(id)).toSorted() })),
    tagGroups: journal.tagGroups.map((group) => ({ ...group, tags: group.tags.map((tag) => tag.label).toSorted() }))
  };
}

test('the registry entry maps to the same journal daylioPreview itself resolves', async () => {
  const csv = await fixture('daylio-edge-cases.csv');
  const existing = emptyArchiveJournal();
  const naming = { tagLabels: () => [] };

  const direct = await daylioPreview(csv, existing, naming);
  const throughRegistry = await daylioEntry.preview(csv, existing, naming);

  assert.deepEqual(byLabel(throughRegistry), byLabel(direct.journal));
});
