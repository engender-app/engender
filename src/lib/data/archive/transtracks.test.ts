/* transtracks.ts's own tests, at the parsing/resolving seam - the same
   layer daylio.test.ts covers for Daylio. Fixtures are built here with
   fflate's zipSync rather than committed as binary files: a zip carrying a
   JSON payload and JPEGs is not something a diff can usefully show either
   way, and a builder function documents exactly what "malformed" means
   next to the assertion that depends on it. */

import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';
import { test } from 'vitest';
import { emptyArchiveJournal } from '../journal/archiveSections.ts';
import { photoFileName } from '../photos/names.ts';
import { TransTracksBackupError, detectTransTracks, transTracksPreview } from './transtracks.ts';
import type { ArchiveJournal } from './payload.ts';

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
  extra?: Record<string, unknown>;
  dataJsonBytes?: Uint8Array;
  omitDataJson?: boolean;
}): Uint8Array {
  const files: Record<string, Uint8Array> = {};

  if (!opts.omitDataJson) {
    const payload = {
      settings: { currentAndroidVersion: 448, startDate: 18628, theme: 'pink' },
      photos: opts.photos ?? [],
      milestones: opts.milestones ?? [],
      ...opts.extra
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

test('detectTransTracks recognises a real backup and declines everything else', () => {
  const valid = backup({ milestones: [milestone()], photos: [] });
  assert.ok(detectTransTracks(valid));

  assert.ok(!detectTransTracks(strToU8('not a zip at all')));
  assert.ok(!detectTransTracks(zipSync({ 'readme.txt': strToU8('no data.json here') })));
  assert.ok(!detectTransTracks(zipSync({ 'data.json': strToU8('{"settings":{}}') })));
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
  const source = photo({ id: 'photo-uuid', epochDay: 20_050, fileName: 'body.jpg' });
  const bytes = jpeg('body');
  const preview = await transTracksPreview(backup({ photos: [source], photoFiles: { 'body.jpg': bytes } }), empty());

  assert.equal(preview.photoCount, 1);
  assert.equal(preview.journal.entries.length, 1);
  const [entry] = preview.journal.entries;
  assert.equal(entry.uuid, 'photo-uuid');
  assert.equal(entry.epochDay, 20_050);
  assert.equal(entry.mood, null);
  assert.equal(entry.note, '');
  assert.equal(entry.photos.length, 1);
  assert.equal(entry.photos[0].id, 'photo-uuid');
  assert.equal(entry.photos[0].fileName, photoFileName('photo-uuid'));
  assert.equal(entry.photos[0].starred, false);

  assert.deepEqual([...preview.rawPhotos.keys()], [photoFileName('photo-uuid')]);
  assert.deepEqual(preview.rawPhotos.get(photoFileName('photo-uuid')), bytes);
});

test('re-importing the same file adds nothing, by the file\'s own uuids', async () => {
  const source = milestone();
  const photoSource = photo();
  const bytes = backup({
    milestones: [source],
    photos: [photoSource],
    photoFiles: { [photoSource.fileName]: jpeg('again') }
  });

  const first = await transTracksPreview(bytes, empty());
  const second = await transTracksPreview(bytes, first.journal);

  assert.equal(second.milestoneCount, 0);
  assert.equal(second.photoCount, 0);
  assert.deepEqual(second.journal.milestones, []);
  assert.deepEqual(second.journal.entries, []);
});

test('a photo whose file is absent from the zip is a named structural error', async () => {
  const source = photo({ fileName: 'missing.jpg' });
  await assert.rejects(
    transTracksPreview(backup({ photos: [source] }), empty()),
    (error: unknown) => error instanceof TransTracksBackupError && /missing\.jpg/.test((error as Error).message)
  );
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

test('an unknown top-level key is named and skipped, not fatal', async () => {
  const preview = await transTracksPreview(
    backup({ milestones: [milestone()], extra: { newFieldFutureVersionAdds: 'whatever' } }),
    empty()
  );

  assert.deepEqual(preview.unknownTopLevelKeys, ['newFieldFutureVersionAdds']);
  assert.equal(preview.milestoneCount, 1);
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
