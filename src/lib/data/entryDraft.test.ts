/* entryDraft's transition rules (ticket 29): draft edits, photo add/remove
   with removed-stored-id tracking, isEmpty and toUpsert() - all rune-free,
   so EntryEditor.svelte only needs a thin $state wrapper around this. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { BODY_REGION_INTENSITY_DEFAULT } from './bodyMap.ts';
import { createEntryDraft } from './entryDraft.ts';
import type { Entry } from './types.ts';
import type { NormalizedPhoto } from './journal/photos.ts';

const photo = (n: number): NormalizedPhoto => ({ full: new Uint8Array([n]), thumb: new Uint8Array([n]) });

const existingEntry = (): Entry => ({
  id: 7,
  epochDay: 20_000,
  timestamp: 123,
  mood: 3,
  note: 'ok day',
  dims: { masculinity: 40 },
  tags: ['e-happy'],
  photos: [{ id: 'p1', fileName: 'p1.jpg' }],
  recordings: [{ id: 'r1', fileName: 'r1.webm' }],
  bodyRegions: { chest: 60 }
});

test('a fresh draft with no existing entry starts empty on the given day', () => {
  const draft = createEntryDraft(20_001);
  assert.equal(draft.isEmpty, true);
  assert.equal(draft.hasMoodOnlyContent, false);
  assert.equal(draft.epochDay, 20_001);
  assert.deepEqual(draft.dims, {});
  assert.deepEqual(draft.tags, []);
  assert.deepEqual(draft.photos, []);
  assert.deepEqual(draft.recordings, []);
  assert.deepEqual(draft.bodyRegions, {});
});

test('a draft hydrated from an existing entry copies its fields and stored photos and recordings', () => {
  const draft = createEntryDraft(20_001, existingEntry());
  assert.equal(draft.isEmpty, false);
  assert.equal(draft.hasMoodOnlyContent, false);
  assert.equal(draft.epochDay, 20_000);
  assert.equal(draft.timestamp, 123);
  assert.equal(draft.mood, 3);
  assert.equal(draft.note, 'ok day');
  assert.deepEqual(draft.dims, { masculinity: 40 });
  assert.deepEqual(draft.tags, ['e-happy']);
  assert.deepEqual(draft.photos, [{ kind: 'stored', photo: { id: 'p1', fileName: 'p1.jpg' } }]);
  assert.deepEqual(draft.recordings, [{ kind: 'stored', recording: { id: 'r1', fileName: 'r1.webm' } }]);
  assert.deepEqual(draft.bodyRegions, { chest: 60 });
});

test('setMood, setNote, setDim and toggleTag each make an empty draft non-empty', () => {
  assert.equal(createEntryDraft(1).isEmpty, true);

  const byMood = createEntryDraft(1);
  byMood.setMood(2);
  assert.equal(byMood.isEmpty, false);
  assert.equal(byMood.hasMoodOnlyContent, true);

  const byNote = createEntryDraft(1);
  byNote.setNote('  ');
  assert.equal(byNote.isEmpty, true, 'a blank note stays empty, matching entryIsEmpty');
  byNote.setNote('hi');
  assert.equal(byNote.isEmpty, false);
  assert.equal(byNote.hasMoodOnlyContent, false);

  const byDim = createEntryDraft(1);
  byDim.setDim('masculinity', 50);
  assert.equal(byDim.isEmpty, false);
  assert.equal(byDim.hasMoodOnlyContent, false);
  assert.deepEqual(byDim.dims, { masculinity: 50 });

  const byTag = createEntryDraft(1);
  byTag.toggleTag('e-happy');
  assert.equal(byTag.isEmpty, false);
  assert.equal(byTag.hasMoodOnlyContent, false);
  assert.deepEqual(byTag.tags, ['e-happy']);

  const byBodyRegion = createEntryDraft(1);
  byBodyRegion.toggleBodyRegion('chest');
  assert.equal(byBodyRegion.isEmpty, false);
  assert.equal(byBodyRegion.hasMoodOnlyContent, false);
  assert.deepEqual(byBodyRegion.bodyRegions, { chest: BODY_REGION_INTENSITY_DEFAULT });
});

test('setDim merges into the existing dims without clobbering the others', () => {
  const draft = createEntryDraft(1, existingEntry());
  draft.setDim('femininity', 60);
  assert.deepEqual(draft.dims, { masculinity: 40, femininity: 60 });
});

test('toggleTag adds an absent tag and removes a present one', () => {
  const draft = createEntryDraft(1);
  draft.toggleTag('e-happy');
  draft.toggleTag('e-sad');
  assert.deepEqual(draft.tags, ['e-happy', 'e-sad']);

  draft.toggleTag('e-happy');
  assert.deepEqual(draft.tags, ['e-sad']);
});

test('toggleBodyRegion adds a region at the default intensity and removes it again', () => {
  const draft = createEntryDraft(1);
  draft.toggleBodyRegion('chest');
  assert.deepEqual(draft.bodyRegions, { chest: BODY_REGION_INTENSITY_DEFAULT });

  draft.setBodyRegionIntensity('chest', 80);
  assert.deepEqual(draft.bodyRegions, { chest: 80 });

  draft.toggleBodyRegion('chest');
  assert.deepEqual(draft.bodyRegions, {});
});

test('addPhoto stages a picked photo; removing it drops it without marking it removed', () => {
  const draft = createEntryDraft(1);
  draft.addPhoto(photo(1));
  assert.equal(draft.isEmpty, false);
  assert.equal(draft.photos.length, 1);
  assert.equal(draft.photos[0].kind, 'picked');

  draft.removePhoto(0);
  assert.deepEqual(draft.photos, []);
  assert.deepEqual(draft.removedPhotoIds, []);
});

test('removing a stored photo tracks its id for removal but a re-visit does not discard it twice', () => {
  const draft = createEntryDraft(1, existingEntry());
  draft.removePhoto(0);
  assert.deepEqual(draft.photos, []);
  assert.deepEqual(draft.removedPhotoIds, ['p1']);
});

test('addRecording stages a recorded clip; removing it drops it without marking it removed', () => {
  const draft = createEntryDraft(1);
  draft.addRecording(new Uint8Array([1]));
  assert.equal(draft.isEmpty, false);
  assert.equal(draft.recordings.length, 1);
  assert.equal(draft.recordings[0].kind, 'recorded');

  draft.removeRecording(0);
  assert.deepEqual(draft.recordings, []);
  assert.deepEqual(draft.removedRecordingIds, []);
});

test('removing a stored recording tracks its id for removal but a re-visit does not discard it twice', () => {
  const draft = createEntryDraft(1, existingEntry());
  draft.removeRecording(0);
  assert.deepEqual(draft.recordings, []);
  assert.deepEqual(draft.removedRecordingIds, ['r1']);
});

test('toUpsert() produces the exact upsertEntry payload for a new entry', () => {
  const draft = createEntryDraft(20_005);
  draft.setMood(4);
  draft.setNote('a note');
  draft.setDim('masculinity', 30);
  draft.toggleTag('e-happy');
  draft.addPhoto(photo(9));

  assert.deepEqual(draft.toUpsert(), {
    id: undefined,
    epochDay: 20_005,
    timestamp: undefined,
    mood: 4,
    note: 'a note',
    dims: { masculinity: 30 },
    tags: ['e-happy'],
    bodyRegions: {},
    attachPhotos: [photo(9)],
    removePhotoIds: [],
    attachRecordings: [],
    removeRecordingIds: []
  });
});

test('toUpsert() for an existing entry carries its id, drops a falsy timestamp and lists both photo and recording changes', () => {
  const draft = createEntryDraft(1, existingEntry());
  draft.addPhoto(photo(2));
  draft.removePhoto(0); // the one stored photo from existingEntry()
  draft.addRecording(new Uint8Array([9]));
  draft.removeRecording(0); // the one stored recording from existingEntry()

  assert.deepEqual(draft.toUpsert(), {
    id: 7,
    epochDay: 20_000,
    timestamp: 123,
    mood: 3,
    note: 'ok day',
    dims: { masculinity: 40 },
    tags: ['e-happy'],
    bodyRegions: { chest: 60 },
    attachPhotos: [photo(2)],
    removePhotoIds: ['p1'],
    attachRecordings: [new Uint8Array([9])],
    removeRecordingIds: ['r1']
  });
});

test('hydrating copies the existing entry, so a later mutation of it cannot discard a typed edit', () => {
  /* This is the case EntryEditor.svelte's onFirstResult guard exists for
     (journal.svelte.ts: "calls fill with a query's first result and never
     again"): the live query for an existing entry is deliberately never
     re-run (its invalidation key list is `[]`), and even if it were,
     onFirstResult would not call back a second time - so nothing should
     ever call createEntryDraft twice for the same editor. What this proves
     at this module's own seam is the property that guarantee rests on:
     hydration takes a one-time copy rather than a live reference, so even a
     mutated or re-delivered `existing` object cannot reach back into an
     already-built draft and clobber what the user typed since. */
  const original = existingEntry();
  const draft = createEntryDraft(1, original);

  draft.setNote('typed after load');
  draft.toggleTag('e-sad');

  original.note = 'clobbered';
  original.dims.masculinity = 999;
  original.tags.push('should-not-appear');
  original.photos.push({ id: 'p2', fileName: 'p2.jpg' });
  original.recordings.push({ id: 'r2', fileName: 'r2.webm' });
  original.bodyRegions.chest = 999;

  assert.equal(draft.note, 'typed after load');
  assert.deepEqual(draft.dims, { masculinity: 40 });
  assert.deepEqual(draft.tags, ['e-happy', 'e-sad']);
  assert.equal(draft.photos.length, 1);
  assert.equal(draft.recordings.length, 1);
  assert.deepEqual(draft.bodyRegions, { chest: 60 });
});

test('a fresh draft can be seeded with a mood and the seed survives hydration', () => {
  const seeded = createEntryDraft(1, undefined, 4);
  assert.equal(seeded.mood, 4);
  assert.equal(seeded.hasMoodOnlyContent, true);

  const hydrated = createEntryDraft(1, existingEntry(), 1);
  assert.equal(hydrated.mood, 3);
});

test('applyTemplate adds its tags without duplicating one already selected', () => {
  const draft = createEntryDraft(1);
  draft.toggleTag('g-euphoria');

  draft.applyTemplate(['g-euphoria', 'g-body-eu'], {});

  assert.deepEqual(draft.tags, ['g-euphoria', 'g-body-eu']);
});

test('applyTemplate sets dims without clobbering a value the draft already had', () => {
  const draft = createEntryDraft(1);
  draft.setDim('masculinity', 40);

  draft.applyTemplate([], { euphoria_dysphoria: 85 });

  assert.deepEqual(draft.dims, { masculinity: 40, euphoria_dysphoria: 85 });
});

test('applyTemplate pre-fills a fresh draft, and every value stays editable afterwards', () => {
  const draft = createEntryDraft(1);

  draft.applyTemplate(['g-euphoria', 'g-body-eu'], { euphoria_dysphoria: 85 });
  assert.deepEqual(draft.tags, ['g-euphoria', 'g-body-eu']);
  assert.deepEqual(draft.dims, { euphoria_dysphoria: 85 });

  draft.toggleTag('g-euphoria');
  draft.setDim('euphoria_dysphoria', 60);
  assert.deepEqual(draft.tags, ['g-body-eu']);
  assert.deepEqual(draft.dims, { euphoria_dysphoria: 60 });
});

test('toUpsert() drops a zero timestamp, matching upsertEntry\'s own fallback', () => {
  const draft = createEntryDraft(1);
  draft.setMood(1);
  assert.equal(draft.toUpsert().timestamp, undefined);
});
