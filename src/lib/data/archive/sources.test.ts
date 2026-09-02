/* The registry itself: that recognition runs the real per-source `detect`
   rather than a name lookup, and that a file nothing recognises is declined
   without any source's `preview` ever being reached.

   What each source itself does with a recognised file is not re-tested
   here - that is daylio.test.ts's, transtracks.test.ts's and
   daylioBackup.test.ts's own. */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'vitest';
import { emptyArchiveJournal } from '../journal/archiveSections.ts';
import { daylioPreview, detectDaylio } from './daylio.ts';
import { daylioBackupPreview } from './daylioBackup.ts';
import { transTracksPreview } from './transtracks.ts';
import { makeDaylioBackup } from './test-support/daylio-backup.ts';
import { ARCHIVE_SOURCES, UnrecognizedArchiveSourceError, recognizeSource, requireSource, type ArchiveSource } from './sources.ts';

const fixtureText = (name: string) => readFile(new URL(`fixtures/${name}`, import.meta.url), 'utf8');
const fixtureBytes = async (name: string) => new TextEncoder().encode(await fixtureText(name));

const stub = (name: string, detect: (bytes: Uint8Array) => boolean): ArchiveSource => ({
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

test('every source is registered, each carrying its own required fields', () => {
  assert.deepEqual(
    ARCHIVE_SOURCES.map((source) => source.name),
    ['daylio', 'daylio-backup', 'transtracks']
  );
  assert.deepEqual(daylioEntry.requiredFields, ['full_date', 'time', 'mood', 'activities', 'note_title', 'note']);
  assert.deepEqual(backupEntry.requiredFields, ['metadata', 'customMoods', 'dayEntries']);
});

test('the two Daylio sources do not claim each other\'s files', async () => {
  const csv = await fixtureBytes('daylio-edge-cases.csv');
  const backup = await makeDaylioBackup();

  assert.equal(recognizeSource(csv), daylioEntry);
  assert.equal(recognizeSource(backup), backupEntry);
});

test('the CSV entry reads a bounded head, so a header is found however long the journal is', async () => {
  const csv = await fixtureBytes('daylio-edge-cases.csv');
  const padded = new Uint8Array(csv.length + 200_000);
  padded.set(csv, 0);
  assert.ok(daylioEntry.detect(padded));
});

test('recognizeSource runs each candidate\'s real detect, not a name filter', async () => {
  const csv = await fixtureBytes('daylio-edge-cases.csv');
  const marker = new TextEncoder().encode('MARKER,anything\n1,2');
  const neither = new TextEncoder().encode('nothing here matches either one');
  const other = stub('other', (bytes) => new TextDecoder().decode(bytes).includes('MARKER'));
  const shortened = [other, daylioEntry];

  // A stub that would match everything is not enough to fool this: only the
  // one whose own detect actually returns true for these bytes is picked.
  assert.equal(recognizeSource(csv, shortened), daylioEntry);
  assert.equal(recognizeSource(marker, shortened), other);
  assert.equal(recognizeSource(neither, shortened), null);
});

test('a file matching no source is declined by name, with no preview attempted', () => {
  const other = stub('other', () => false);
  assert.throws(() => requireSource(new TextEncoder().encode('not a known file shape'), [other]), UnrecognizedArchiveSourceError);
});

test('detectDaylio sniffs the header alone, so a malformed body still detects as Daylio', async () => {
  const wellFormed = await fixtureText('daylio-edge-cases.csv');
  const malformed = await fixtureText('daylio-malformed.csv');

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
  const csv = await fixtureText('daylio-edge-cases.csv');
  const existing = emptyArchiveJournal();
  const naming = { tagLabels: () => [] };

  const direct = await daylioPreview(csv, existing, naming);
  const throughRegistry = await daylioEntry.preview(new TextEncoder().encode(csv), existing, naming);

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

test('the transtracks entry recognises a real backup and maps to the same journal transTracksPreview itself resolves', async () => {
  const transtracksEntry = ARCHIVE_SOURCES.find((source) => source.name === 'transtracks')!;
  const bytes = await readFile(new URL('fixtures/transtracks-edge-cases.ttbackup', import.meta.url));
  const existing = emptyArchiveJournal();

  assert.ok(transtracksEntry.detect(bytes));
  assert.ok(!transtracksEntry.detect(await fixtureBytes('daylio-edge-cases.csv')));

  const direct = await transTracksPreview(bytes, existing);
  const throughRegistry = await transtracksEntry.preview(bytes, existing, undefined);

  assert.deepEqual(throughRegistry, direct.journal);
});
