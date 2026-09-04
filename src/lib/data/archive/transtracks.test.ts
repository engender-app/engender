/* transtracks.ts's own tests, at the parsing/resolving seam - the same
   layer daylio.test.ts covers for Daylio. `transtracks-edge-cases.ttbackup`
   and `transtracks-malformed.ttbackup` are the committed fixture pair
   spec.md's Testing Decisions ask every source to ship, built the same way
   `daylio-edge-cases.csv` bundles several real scenarios into one file
   rather than one fixture per scenario. Narrower single-purpose cases
   (a bad data.json, one malformed field) stay inline with fflate's zipSync,
   the same mix daylio.test.ts itself uses alongside its own fixtures. */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { strToU8, zipSync } from 'fflate';
import { test } from 'vitest';
import { emptyArchiveJournal } from '../journal/archiveSections.ts';
import { photoFileName } from '../photos/names.ts';
import { TransTracksBackupError, detectTransTracks, transTracksPreview } from './transtracks.ts';
import type { ArchiveJournal } from './payload.ts';

const fixtureBytes = async (name: string): Promise<Uint8Array> =>
  new Uint8Array(await readFile(new URL(`fixtures/${name}`, import.meta.url)));

interface RawMilestone {
  id: string;
  epochDay: number;
  timestamp?: number;
  title: string;
  description?: string;
}

interface RawPhoto {
  id: string;
  epochDay: number;
  timestamp?: number;
  fileName: string;
  type?: number;
}

function backup(opts: {
  milestones?: Partial<RawMilestone>[];
  photos?: Partial<RawPhoto>[];
  photoFiles?: Record<string, Uint8Array>;
  dataJsonBytes?: Uint8Array;
  omitDataJson?: boolean;
}): Uint8Array {
  const files: Record<string, Uint8Array> = {};

  if (!opts.omitDataJson) {
    const payload = {
      settings: { currentAndroidVersion: 448, startDate: 18628, theme: 'pink' },
      photos: opts.photos ?? [],
      milestones: opts.milestones ?? []
    };
    files['data.json'] = opts.dataJsonBytes ?? strToU8(JSON.stringify(payload));
  }

  for (const [name, bytes] of Object.entries(opts.photoFiles ?? {})) {
    files[`photos/${name}`] = bytes;
  }

  return zipSync(files);
}

const jpeg = (marker: string) => strToU8(`not a real jpeg: ${marker}`);

const milestone = (overrides: Partial<RawMilestone> = {}): RawMilestone => ({
  id: '11111111-1111-1111-1111-111111111111',
  epochDay: 20_000,
  timestamp: 1_700_000_000_000,
  title: 'Started HRT',
  description: 'First injection, hands shaking',
  ...overrides
});

const photo = (overrides: Partial<RawPhoto> = {}): RawPhoto => ({
  id: '22222222-2222-2222-2222-222222222222',
  epochDay: 20_010,
  timestamp: 1_700_100_000_000,
  fileName: 'face.jpg',
  type: 0,
  ...overrides
});

const empty = (): ArchiveJournal => emptyArchiveJournal();

test('detectTransTracks sniffs data.json\'s shape alone, so a malformed body still detects as TransTracks', async () => {
  const wellFormed = await fixtureBytes('transtracks-edge-cases.ttbackup');
  const malformed = await fixtureBytes('transtracks-malformed.ttbackup');

  assert.ok(detectTransTracks(wellFormed));
  assert.ok(detectTransTracks(malformed));

  assert.ok(!detectTransTracks(strToU8('not a zip at all')));
  assert.ok(!detectTransTracks(zipSync({ 'readme.txt': strToU8('no data.json here') })));
  assert.ok(!detectTransTracks(zipSync({ 'data.json': strToU8('{"settings":{}}') })));
});

test('the well-formed fixture: two milestones map directly, the one real photo becomes a dated entry, the orphan is counted, the unknown key and the face/body flag are named', async () => {
  const preview = await transTracksPreview(await fixtureBytes('transtracks-edge-cases.ttbackup'), empty());

  assert.equal(preview.milestoneCount, 2);
  const withDescription = preview.journal.milestones.find((m) => m.name === 'Started HRT')!;
  assert.equal(withDescription.description, 'First injection, hands shaking');
  const withoutDescription = preview.journal.milestones.find((m) => m.name === 'Told a friend')!;
  assert.equal(withoutDescription.description, '', 'a milestone with no description field reads as empty, not missing');

  assert.equal(preview.photoCount, 1);
  const [entry] = preview.journal.entries;
  assert.equal(entry.uuid, '8b4e1f1a-6b7a-4e7a-9c1a-2f6b0a9d1c11');
  assert.equal(entry.photos[0].fileName, photoFileName(entry.uuid));

  // photos/orphaned-not-in-data-json.jpg rides along in the zip but no
  // photo record names it - counted, never imported as a loose photo.
  assert.equal(preview.orphanedPhotoCount, 1);

  assert.deepEqual(preview.unknownTopLevelKeys, ['fromABuildWeDoNotKnowAbout']);
  assert.deepEqual(preview.ignoredFields, ['type (face or body)']);
});

test('the malformed fixture: a photo record names a file the zip does not carry, and preview refuses it by name', async () => {
  await assert.rejects(
    transTracksPreview(await fixtureBytes('transtracks-malformed.ttbackup'), empty()),
    (error: unknown) => error instanceof TransTracksBackupError && /missing\.jpg/.test((error as Error).message)
  );
});

test('re-importing the well-formed fixture a second time adds nothing, by the file\'s own uuids', async () => {
  const bytes = await fixtureBytes('transtracks-edge-cases.ttbackup');

  const first = await transTracksPreview(bytes, empty());
  const second = await transTracksPreview(bytes, first.journal);

  assert.equal(second.milestoneCount, 0);
  assert.equal(second.photoCount, 0);
  assert.deepEqual(second.journal.milestones, []);
  assert.deepEqual(second.journal.entries, []);
});

test('a milestone maps nearly directly: title to name, description to description, epochDay untouched', async () => {
  const source = milestone({ epochDay: 20_123, title: 'Started HRT', description: 'Hands shaking' });
  const preview = await transTracksPreview(backup({ milestones: [source] }), empty());

  assert.equal(preview.milestoneCount, 1);
  assert.deepEqual(preview.journal.milestones, [
    {
      id: source.id,
      name: 'Started HRT',
      epochDay: 20_123,
      description: 'Hands shaking',
      templateKey: null,
      roadmapGoalKey: null,
      procedureId: null,
      tryoutId: null,
      photo: null
    }
  ]);
});

test('epochDay is used directly - no date arithmetic runs on it', async () => {
  // A value that date arithmetic (any timezone offset, any month/day split)
  // would be very unlikely to leave unchanged by accident.
  const oddEpochDay = 19_999;
  const preview = await transTracksPreview(backup({ milestones: [milestone({ epochDay: oddEpochDay })] }), empty());
  assert.equal(preview.journal.milestones[0].epochDay, oddEpochDay);
});

test('a photo becomes a dated entry carrying it, identified by the photo\'s own uuid', async () => {
  const id = '33333333-3333-3333-3333-333333333333';
  const source = photo({ id, epochDay: 20_050, fileName: 'body.jpg' });
  const bytes = jpeg('body');
  const preview = await transTracksPreview(backup({ photos: [source], photoFiles: { 'body.jpg': bytes } }), empty());

  assert.equal(preview.photoCount, 1);
  assert.equal(preview.journal.entries.length, 1);
  const [entry] = preview.journal.entries;
  assert.equal(entry.uuid, id);
  assert.equal(entry.epochDay, 20_050);
  assert.equal(entry.mood, null);
  assert.equal(entry.note, '');
  assert.equal(entry.photos.length, 1);
  assert.equal(entry.photos[0].id, id);
  assert.equal(entry.photos[0].fileName, photoFileName(id));
  assert.equal(entry.photos[0].starred, false);

  assert.deepEqual([...preview.rawPhotos.keys()], [photoFileName(id)]);
  assert.deepEqual(preview.rawPhotos.get(photoFileName(id)), bytes);
});

/* A hostile or corrupt file's own `photos[].id` must not become the stored
   photo file's name or the row's travelling uuid unvalidated (ADR-0002) -
   ticket 12. A real TransTracks uuid still passes straight through (the test
   above); anything else is replaced by a uuid derived from that same string,
   so the file cannot choose the identity but a repeated import of the same
   file is still a no-op. */

test('a photo id containing a separator imports rather than throwing during the file pass', async () => {
  const source = photo({ id: 'a/../b', epochDay: 20_060, fileName: 'body.jpg' });
  const bytes = jpeg('body');
  const preview = await transTracksPreview(backup({ photos: [source], photoFiles: { 'body.jpg': bytes } }), empty());

  assert.equal(preview.photoCount, 1);
  const [entry] = preview.journal.entries;
  assert.notEqual(entry.uuid, 'a/../b');
  assert.match(entry.uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(entry.photos[0].fileName, photoFileName(entry.uuid));
  assert.deepEqual([...preview.rawPhotos.keys()], [photoFileName(entry.uuid)]);
});

test('a photo id that is not a uuid imports with a uuid derived from it, and the photo file is named from it', async () => {
  const source = photo({ id: 'not-a-real-uuid', epochDay: 20_070, fileName: 'body.jpg' });
  const bytes = jpeg('body');
  const preview = await transTracksPreview(backup({ photos: [source], photoFiles: { 'body.jpg': bytes } }), empty());

  const [entry] = preview.journal.entries;
  assert.notEqual(entry.uuid, 'not-a-real-uuid');
  assert.match(entry.uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(entry.photos[0].id, entry.uuid);
  assert.equal(entry.photos[0].fileName, photoFileName(entry.uuid));
});

test('importing the same file twice is still a no-op even when its photo id is not a uuid', async () => {
  const source = photo({ id: 'not-a-real-uuid', epochDay: 20_070, fileName: 'body.jpg' });
  const bytes = backup({ photos: [source], photoFiles: { 'body.jpg': jpeg('body') } });

  const first = await transTracksPreview(bytes, empty());
  const second = await transTracksPreview(bytes, first.journal);

  assert.equal(first.photoCount, 1);
  assert.equal(second.photoCount, 0);
  assert.deepEqual(second.journal.entries, []);
});

test('a referenced photo file that is present but empty is also a structural error', async () => {
  const source = photo({ fileName: 'empty.jpg' });
  await assert.rejects(
    transTracksPreview(backup({ photos: [source], photoFiles: { 'empty.jpg': new Uint8Array(0) } }), empty()),
    TransTracksBackupError
  );
});

test('orphaned photo files are ignored and counted, not imported as loose photos', async () => {
  const preview = await transTracksPreview(
    backup({ photos: [], photoFiles: { 'orphan1.jpg': jpeg('1'), 'orphan2.jpg': jpeg('2') } }),
    empty()
  );

  assert.equal(preview.orphanedPhotoCount, 2);
  assert.equal(preview.journal.entries.length, 0);
});

test('the face/body flag is named as ignored when the file carries photos, and not otherwise', async () => {
  const withPhotos = await transTracksPreview(
    backup({ photos: [photo()], photoFiles: { [photo().fileName]: jpeg('x') } }),
    empty()
  );
  assert.deepEqual(withPhotos.ignoredFields, ['type (face or body)']);

  const withoutPhotos = await transTracksPreview(backup({ photos: [] }), empty());
  assert.deepEqual(withoutPhotos.ignoredFields, []);
});

test('a missing data.json is a named structural error', async () => {
  await assert.rejects(transTracksPreview(backup({ omitDataJson: true }), empty()), /data\.json/);
});

test('an unparseable data.json is a named structural error', async () => {
  await assert.rejects(
    transTracksPreview(backup({ dataJsonBytes: strToU8('{not json') }), empty()),
    /data\.json.*not valid JSON/
  );
});

test('a malformed milestone record throws, naming the record', async () => {
  await assert.rejects(
    transTracksPreview(backup({ milestones: [{ epochDay: 20_000, title: 'no id' }] }), empty()),
    /milestone 0.*id/
  );
});

test('a malformed photo record throws, naming the record', async () => {
  await assert.rejects(
    transTracksPreview(backup({ photos: [{ id: 'x', fileName: 'x.jpg' }] }), empty()),
    /photo 0.*epochDay/
  );
});
