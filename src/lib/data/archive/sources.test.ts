/* The registry itself: that recognition runs the real per-source `detect`
   rather than a name lookup, and that a file nothing recognises is declined
   without any source's `preview` ever being reached.

   What Daylio itself does with a recognised file is not re-tested here -
   that is daylio.ts's own journal.test.ts, which this ticket leaves
   unchanged, and daylioBackup.test.ts for the backup source. */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'vitest';
import { emptyArchiveJournal } from '../journal/archiveSections.ts';
import { daylioBackupPreview } from './daylioBackup.ts';
import { daylioPreview, detectDaylio } from './daylio.ts';
import { makeDaylioBackup } from './test-support/daylio-backup.ts';
import { ARCHIVE_SOURCES, UnrecognizedArchiveSourceError, recognizeSource, requireSource, type ArchiveSource } from './sources.ts';

const fixture = async (name: string) => new Uint8Array(await readFile(new URL(`fixtures/${name}`, import.meta.url)));
const bytes = (text: string) => new TextEncoder().encode(text);
const asText = (file: Uint8Array) => new TextDecoder().decode(file);

const stub = (name: string, detect: (file: Uint8Array) => boolean): ArchiveSource => ({
  name: name as ArchiveSource['name'],
  requiredFields: [],
  detect,
  async preview() {
    throw new Error(`${name} stub preview should never be called`);
  }
});

const entryFor = (name: ArchiveSource['name']) => ARCHIVE_SOURCES.find((source) => source.name === name)!;
const daylioEntry = entryFor('daylio');
const backupEntry = entryFor('daylio-backup');

test('both Daylio sources are registered, each carrying its own required fields', () => {
  assert.deepEqual(ARCHIVE_SOURCES.map((source) => source.name), ['daylio', 'daylio-backup']);
  assert.deepEqual(daylioEntry.requiredFields, ['full_date', 'time', 'mood', 'activities', 'note_title', 'note']);
  assert.deepEqual(backupEntry.requiredFields, ['metadata', 'customMoods', 'dayEntries']);
});

test("recognizeSource runs each candidate's real detect, not a name filter", async () => {
  const csv = await fixture('daylio-edge-cases.csv');
  const other = stub('other', (file) => asText(file).includes('MARKER'));
  const shortened = [other, daylioEntry];

  // A stub that would match everything is not enough to fool this: only the
  // one whose own detect actually returns true for this text is picked.
  assert.equal(recognizeSource(csv, shortened), daylioEntry);
  assert.equal(recognizeSource(bytes('MARKER,anything\n1,2'), shortened), other);
  assert.equal(recognizeSource(bytes('nothing here matches either one'), shortened), null);
});

test('the two Daylio sources do not claim each other\'s files', async () => {
  const csv = await fixture('daylio-edge-cases.csv');
  const backup = await makeDaylioBackup();

  assert.equal(recognizeSource(csv), daylioEntry);
  assert.equal(recognizeSource(backup), backupEntry);
});

test('a file matching no source is declined by name, with no preview attempted', () => {
  const other = stub('other', () => false);
  assert.throws(() => requireSource(bytes('not a known file shape'), [other]), UnrecognizedArchiveSourceError);
});

test('detectDaylio sniffs the header alone, so a malformed body still detects as Daylio', async () => {
  const wellFormed = await fixture('daylio-edge-cases.csv');
  const malformed = await fixture('daylio-malformed.csv');

  assert.ok(detectDaylio(asText(wellFormed)));
  assert.ok(detectDaylio(asText(malformed)));
  assert.ok(!detectDaylio('name,unrelated,columns\nA,B,C'));
});

test('the CSV entry detects a header past no fixed offset, reading only the head of the file', async () => {
  const csv = await fixture('daylio-edge-cases.csv');
  // Detection decodes a bounded head rather than the whole file, so a
  // header that sits inside it is found however long the journal is.
  const padded = new Uint8Array(csv.length + 200_000);
  padded.set(csv, 0);
  assert.ok(daylioEntry.detect(padded));
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

  const direct = await daylioPreview(asText(csv), existing, naming);
  const throughRegistry = await daylioEntry.preview(csv, existing, naming);

  assert.deepEqual(byLabel(throughRegistry), byLabel(direct.journal));
});

test('the backup entry maps to the same journal daylioBackupPreview itself resolves', async () => {
  const backup = await makeDaylioBackup();
  const naming = { tagLabels: () => [] };

  const direct = await daylioBackupPreview(backup, emptyArchiveJournal(), naming);
  const throughRegistry = await backupEntry.preview(backup, emptyArchiveJournal(), naming);

  // Identities are derived from content here rather than minted, so the
  // two runs are comparable whole.
  assert.deepEqual(throughRegistry, direct.journal);
});
