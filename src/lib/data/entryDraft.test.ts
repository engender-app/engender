/* entryDraft's transition rules (ticket 29): draft edits, photo add/remove
   with removed-stored-id tracking, isEmpty and toUpsert() - all rune-free,
   so EntryEditor.svelte only needs a thin $state wrapper around this. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
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
  photos: [{ id: 'p1', fileName: 'p1.jpg', starred: false }],
  recordings: [{ id: 'r1', fileName: 'r1.webm' }],
  videos: [{ id: 'n1', fileName: 'n1.webm' }],
  bodyRegions: { chest: { dysphoria: 60, euphoria: null } },
  starred: false
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
  assert.deepEqual(draft.photos, [{ kind: 'stored', photo: { id: 'p1', fileName: 'p1.jpg', starred: false } }]);
  assert.deepEqual(draft.recordings, [{ kind: 'stored', recording: { id: 'r1', fileName: 'r1.webm' } }]);
  assert.deepEqual(draft.bodyRegions, { chest: { dysphoria: 60, euphoria: null } });
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

  // Picking a region only puts its sliders on screen (ticket 31). Content
  // arrives when an axis does, so the draft is still empty until then.
  const byBodyRegion = createEntryDraft(1);
  byBodyRegion.toggleBodyRegion('chest');
  assert.equal(byBodyRegion.isEmpty, true);
  byBodyRegion.setBodyRegionFeeling('chest', { dysphoria: null, euphoria: 70 });
  assert.equal(byBodyRegion.isEmpty, false);
  assert.equal(byBodyRegion.hasMoodOnlyContent, false);
  assert.deepEqual(byBodyRegion.bodyRegions, { chest: { dysphoria: null, euphoria: 70 } });
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

test('toggleBodyRegion adds a region with neither axis set and removes it again', () => {
  const draft = createEntryDraft(1);
  draft.toggleBodyRegion('chest');
  assert.deepEqual(draft.bodyRegions, { chest: { dysphoria: null, euphoria: null } });

  draft.setBodyRegionFeeling('chest', { dysphoria: 80, euphoria: null });
  assert.deepEqual(draft.bodyRegions, { chest: { dysphoria: 80, euphoria: null } });

  draft.toggleBodyRegion('chest');
  assert.deepEqual(draft.bodyRegions, {});
});

test('setBodyRegionFeeling writes one region\'s whole feeling, overwriting both axes', () => {
  const draft = createEntryDraft(1);
  draft.toggleBodyRegion('chest');

  draft.setBodyRegionFeeling('chest', { dysphoria: null, euphoria: 70 });
  assert.deepEqual(draft.bodyRegions, { chest: { dysphoria: null, euphoria: 70 } });

  // Overwrite, not merge: the picker's one bipolar slider (ticket 99) only
  // ever produces a single axis, and dragging back across the midpoint has
  // to take the side it came from with it. Both-set rows still exist from
  // the two-slider UI, so a whole-feeling write is still sayable.
  draft.setBodyRegionFeeling('chest', { dysphoria: 30, euphoria: null });
  assert.deepEqual(draft.bodyRegions, { chest: { dysphoria: 30, euphoria: null } });
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
    removeRecordingIds: [],
    attachVideos: [],
    removeVideoIds: []
  });
});

test('toUpsert() for an existing entry carries its id, drops a falsy timestamp and lists photo, recording and video changes', () => {
  const draft = createEntryDraft(1, existingEntry());
  draft.addPhoto(photo(2));
  draft.removePhoto(0); // the one stored photo from existingEntry()
  draft.addRecording(new Uint8Array([9]));
  draft.removeRecording(0); // the one stored recording from existingEntry()
  draft.addVideo(new Uint8Array([8]));
  draft.removeVideo(0); // the one stored video note from existingEntry()

  assert.deepEqual(draft.toUpsert(), {
    id: 7,
    epochDay: 20_000,
    timestamp: 123,
    mood: 3,
    note: 'ok day',
    dims: { masculinity: 40 },
    tags: ['e-happy'],
    bodyRegions: { chest: { dysphoria: 60, euphoria: null } },
    attachPhotos: [photo(2)],
    removePhotoIds: ['p1'],
    attachRecordings: [new Uint8Array([9])],
    removeRecordingIds: ['r1'],
    attachVideos: [new Uint8Array([8])],
    removeVideoIds: ['n1']
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
  original.photos.push({ id: 'p2', fileName: 'p2.jpg', starred: false });
  original.recordings.push({ id: 'r2', fileName: 'r2.webm' });
  original.bodyRegions.chest.dysphoria = 999;

  assert.equal(draft.note, 'typed after load');
  assert.deepEqual(draft.dims, { masculinity: 40 });
  assert.deepEqual(draft.tags, ['e-happy', 'e-sad']);
  assert.equal(draft.photos.length, 1);
  assert.equal(draft.recordings.length, 1);
  assert.deepEqual(draft.bodyRegions, { chest: { dysphoria: 60, euphoria: null } });
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

test('draft holds contextual sub-records and attaches them to toUpsert payload', () => {
  const draft = createEntryDraft(20_000);
  draft.setMood(4);

  assert.equal(draft.tryoutFeltSense, null);
  assert.equal(draft.doseLog, null);
  assert.equal(draft.procedureRecovery, null);
  assert.equal(draft.effectMarker, null);
  assert.equal(draft.cycleEvent, null);

  draft.setTryoutFeltSense({ tryoutId: 'tryout-1', mood: 5, note: 'felt great' });
  draft.setDoseLog({ dose: 2, doseUnit: 'mg', route: 'oral', drug: 'Estradiol' });
  draft.setProcedureRecovery({ procedureId: 'proc-1', notes: 'swelling down' });
  draft.setEffectMarker({ effect: 'skin_softening', firstNoticedEpochDay: 20_000 });
  draft.setCycleEvent({ kind: 'period_occurred', epochDay: 20_000 });

  const upsert = draft.toUpsert();
  assert.deepEqual(upsert.tryoutFeltSense, { tryoutId: 'tryout-1', mood: 5, note: 'felt great' });
  assert.deepEqual(upsert.doseLog, { dose: 2, doseUnit: 'mg', route: 'oral', drug: 'Estradiol' });
  assert.deepEqual(upsert.procedureRecovery, { procedureId: 'proc-1', notes: 'swelling down' });
  assert.deepEqual(upsert.effectMarker, { effect: 'skin_softening', firstNoticedEpochDay: 20_000 });
  assert.deepEqual(upsert.cycleEvent, { kind: 'period_occurred', epochDay: 20_000 });

  // Can be cleared back to null
  draft.setTryoutFeltSense(null);
  draft.setDoseLog(null);
  draft.setProcedureRecovery(null);
  draft.setEffectMarker(null);
  draft.setCycleEvent(null);

  const clearedUpsert = draft.toUpsert();
  assert.equal(clearedUpsert.tryoutFeltSense, undefined);
  assert.equal(clearedUpsert.doseLog, undefined);
  assert.equal(clearedUpsert.procedureRecovery, undefined);
  assert.equal(clearedUpsert.effectMarker, undefined);
  assert.equal(clearedUpsert.cycleEvent, undefined);
});

