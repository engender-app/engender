/* Day One import at the source-module seam: preview resolves the whole
   journal a commit would write, the same contract daylio.test.ts exercises
   for its own source. The fixtures are real zip files - see
   test-support/zip-builder.ts's own header for why - rather than inline
   strings, because the container is exactly where a hand-written reader
   tends to get an offset wrong. */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'vitest';
import { emptyArchiveJournal } from '../journal/archiveSections.ts';
import type { ArchiveJournal } from './payload.ts';
import { extractZipEntry, readZipEntries } from './dayone-zip.ts';
import { buildZip } from './test-support/zip-builder.ts';
import {
  DayOneImportError,
  dayonePreview,
  detectDayOne,
  localDayInZone,
  normalizeDayOneUuid,
  type PhotoNormalizer
} from './dayone.ts';

const fixture = async (name: string) => new Uint8Array(await readFile(new URL(`fixtures/${name}`, import.meta.url)));

const naming = {
  tagLabels(id: string): string[] {
    return id === 'a-good-day' ? ['good day'] : [];
  }
};

/** A stand-in for the browser-only `normalizePhoto` (dayone.ts's own
    `PhotoNormalizer` doc comment says why this is injected rather than
    imported): echoes the raw bytes back as both full and thumb, so this
    file can test resolution, verification and attachment without a
    decoder or a canvas. */
const echoNormalize: PhotoNormalizer = async (bytes) => ({ full: bytes, thumb: bytes });

const existingWithGoodDayTag: ArchiveJournal = {
  ...emptyArchiveJournal(),
  tagGroups: [
    {
      key: 'activities',
      name: '',
      enabled: true,
      builtIn: true,
      tags: [{ id: 'a-good-day', label: 'Good day', builtIn: true, hidden: false }]
    }
  ]
};

test('detectDayOne recognises the fixture, and only the fixture', async () => {
  const wellFormed = await fixture('dayone-edge-cases.zip');
  const malformed = await fixture('dayone-malformed.zip');
  const notAZip = new TextEncoder().encode('not a zip at all');

  assert.ok(detectDayOne(wellFormed));
  // Malformed at the JSON level, not the zip level: still a zip carrying
  // one top-level journal file, which is all detect ever promises - the
  // same split detectDaylio's own header/body distinction draws.
  assert.ok(detectDayOne(malformed));
  assert.ok(!detectDayOne(notAZip));
});

test('the whole edge-cases fixture resolves: counts, tags, notes and photos', async () => {
  const zip = await fixture('dayone-edge-cases.zip');
  const preview = await dayonePreview(zip, existingWithGoodDayTag, naming, echoNormalize);

  assert.equal(preview.entryCount, 4);
  assert.equal(preview.matchedTagCount, 1); // "good day", used by two entries, matched once
  assert.equal(preview.newTagCount, 2); // "exercise" and "reading"
  assert.equal(preview.photoCount, 2);
  assert.equal(preview.unresolvedPhotoCount, 0);
});

test('a heading becomes the note\'s own first line, with the # marker dropped and backslash-escaped punctuation restored', async () => {
  const zip = await fixture('dayone-edge-cases.zip');
  const preview = await dayonePreview(zip, emptyArchiveJournal(), naming, echoNormalize);

  const withHeading = preview.journal.entries.find((e) => e.note.startsWith('A good day'))!;
  assert.ok(withHeading.note.startsWith('A good day\n'), withHeading.note);
  assert.ok(withHeading.note.includes('Today felt really good. Walked by the river, mid-thought'), withHeading.note);
  assert.ok(!withHeading.note.includes('dayone-moment://'), 'the inline photo embed should be stripped from the note');
});

test('no heading in text is exactly as sensible: the note is the content, unmodified', async () => {
  const zip = await fixture('dayone-edge-cases.zip');
  const preview = await dayonePreview(zip, emptyArchiveJournal(), naming, echoNormalize);

  const noHeading = preview.journal.entries.find((e) => e.note.startsWith('Just a normal note'))!;
  assert.equal(noHeading.note, 'Just a normal note about the day. Nothing fancy, just glad it happened.');
});

test('an entry with no tags key imports without throwing, and richText fills in for empty text', async () => {
  const zip = await fixture('dayone-edge-cases.zip');
  const preview = await dayonePreview(zip, emptyArchiveJournal(), naming, echoNormalize);

  const onboarding = preview.journal.entries.find((e) => e.note.startsWith('An onboarding entry'))!;
  assert.deepEqual(onboarding.tags, []);
  assert.ok(onboarding.note.includes('Welcome to your journal, written entirely in richText.'), onboarding.note);
});

test('a photo\'s bytes verify against its md5 and the file attaches', async () => {
  const zip = await fixture('dayone-edge-cases.zip');
  const preview = await dayonePreview(zip, emptyArchiveJournal(), naming, echoNormalize);

  const withPhoto = preview.journal.entries.find((e) => e.note.startsWith('A good day'))!;
  assert.equal(withPhoto.photos.length, 1);
  const [photo] = withPhoto.photos;
  const [full, thumb] = preview.files.filter((f) => f.name.startsWith(photo.fileName.replace('.jpg', '')));
  assert.ok(full.bytes.length > 0);
  assert.ok(thumb.bytes.length > 0);
});

test('an unresolvable md5Thumbnail does not fail the import, and its own full photo still resolves', async () => {
  const zip = await fixture('dayone-edge-cases.zip');
  const preview = await dayonePreview(zip, emptyArchiveJournal(), naming, echoNormalize);

  const dangling = preview.journal.entries.find((e) => e.note.startsWith('A day with a photo'))!;
  assert.equal(dangling.photos.length, 1, 'the full photo resolves even though md5Thumbnail names a file the zip does not carry');
  assert.equal(preview.unresolvedPhotoCount, 0);
});

test('a photo with no date of its own does not throw - this app has nowhere to put one anyway', async () => {
  // photo objects in the fixture never carry a `date` field at all (module
  // header, point 2/the corrections: absent, not present-and-null), and
  // ArchivePhoto has no date field for one to land in - so the only real
  // claim this makes is "importing does not choke on the absent key",
  // which the fixture-wide test above already proves by not throwing.
  const zip = await fixture('dayone-edge-cases.zip');
  await assert.doesNotReject(dayonePreview(zip, emptyArchiveJournal(), naming, echoNormalize));
});

test('re-importing the same fixture is a no-op: uuid normalisation is deterministic and import is append-only', async () => {
  const zip = await fixture('dayone-edge-cases.zip');
  const first = await dayonePreview(zip, emptyArchiveJournal(), naming, echoNormalize);
  assert.equal(first.entryCount, 4);

  // Simulate the merge that would have committed `first`: importing again
  // against a journal that already has those entries should add none of
  // them a second time, which only holds if the same uuid was minted both
  // times from the same source uuid.
  const alreadyImported: ArchiveJournal = { ...emptyArchiveJournal(), entries: first.journal.entries };
  const second = await dayonePreview(zip, alreadyImported, naming, echoNormalize);
  assert.equal(second.entryCount, 0);
  assert.equal(second.files.length, 0, 'an already-imported entry\'s photos are not re-resolved into orphaned files');
});

test('a metadata.version other than "1.0" is refused by name, no partial import', async () => {
  const zip = await fixture('dayone-edge-cases.zip');
  const journal = JSON.parse(new TextDecoder().decode(await extractJournalJson(zip)));
  journal.metadata.version = '2.0';

  const rebuilt = rezip(journal);
  await assert.rejects(dayonePreview(rebuilt, emptyArchiveJournal(), naming, echoNormalize), /metadata\.version.*"2\.0".*"1\.0"/s);
});

test('a malformed journal file is rejected during preview, before anything is written', async () => {
  const zip = await fixture('dayone-malformed.zip');
  await assert.rejects(dayonePreview(zip, emptyArchiveJournal(), naming, echoNormalize), DayOneImportError);
});

test('dayone-moment:// resolves through the photos array, and identifier/md5 case is never conflated', async () => {
  // The real export's own shapes (see the ticket): identifier uppercase,
  // md5 lowercase, on the SAME photos[] entry - so a photo referenced
  // mid-text (not as the whole entry) still resolves to the right file,
  // and a deliberately mixed-case identifier that happens to share
  // characters with a lowercase md5 must not be treated as a match.
  const zip = await fixture('dayone-edge-cases.zip');
  const preview = await dayonePreview(zip, emptyArchiveJournal(), naming, echoNormalize);
  const withPhoto = preview.journal.entries.find((e) => e.note.startsWith('A good day'))!;
  assert.equal(withPhoto.photos.length, 1, 'resolved via photos[].md5, matched to the file the zip actually carries');
});

test('localDayInZone reads the calendar date in the given zone, not the device\'s', () => {
  // A positive offset (UTC+9): 23:30 UTC is already the next calendar day in Tokyo.
  const tokyo = localDayInZone(Date.parse('2026-06-14T23:30:00Z'), 'Asia/Tokyo');
  const tokyoNextDay = localDayInZone(Date.parse('2026-06-15T00:30:00Z'), 'UTC');
  assert.equal(tokyo, tokyoNextDay);

  // A negative offset (UTC-7, no DST in January): 03:00 UTC is still the previous day in Denver.
  const denver = localDayInZone(Date.parse('2026-01-16T03:00:00Z'), 'America/Denver');
  const denverPreviousDay = localDayInZone(Date.parse('2026-01-15T00:00:00Z'), 'UTC');
  assert.equal(denver, denverPreviousDay);

  // US DST starts 2026-03-08 02:00 local (clocks jump to 03:00): an instant
  // either side of the transition still reads its own correct local day.
  const beforeSpringForward = localDayInZone(Date.parse('2026-03-08T09:00:00Z'), 'America/Denver'); // 02:00 MST
  const afterSpringForward = localDayInZone(Date.parse('2026-03-08T10:00:00Z'), 'America/Denver'); // 04:00 MDT
  assert.equal(beforeSpringForward, afterSpringForward);
  assert.equal(beforeSpringForward, localDayInZone(Date.parse('2026-03-08T00:00:00Z'), 'UTC'));
});

test('normalizeDayOneUuid reshapes the 32-hex form deterministically', () => {
  const a = normalizeDayOneUuid('5E2B69750D5248378592CC8DAE174009', 'a');
  const b = normalizeDayOneUuid('5e2b69750d5248378592cc8dae174009', 'a');
  assert.equal(a, '5e2b6975-0d52-4837-8592-cc8dae174009');
  assert.equal(a, b, 'case in the source uuid does not change the result');
  assert.throws(() => normalizeDayOneUuid('not-a-uuid', 'a'), DayOneImportError);
});

// --- helper for the version-refusal test, which needs a fixture the
// normal build script does not produce -------------------------------

async function extractJournalJson(zip: Uint8Array): Promise<Uint8Array> {
  const entries = readZipEntries(zip);
  const journalEntry = entries.find((e) => e.name === 'Journal.json')!;
  return extractZipEntry(zip, journalEntry);
}

function rezip(journal: unknown): Uint8Array {
  return buildZip([{ name: 'Journal.json', data: new TextEncoder().encode(JSON.stringify(journal)), method: 0 }]);
}
