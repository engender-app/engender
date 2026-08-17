/* entryDraftPersistence's transition rules (ticket 14): what survives a
   killed process is a plain, storage-shaped snapshot of the draft's
   editable fields, matched back to the entry/day it belongs to and
   reapplied on top of a freshly created draft - never the picked photos'
   raw bytes (out of size budget for a localStorage mirror), only which
   stored photo ids the user had already removed. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createEntryDraft } from './entryDraft.ts';
import { applyPersistedDraft, draftMatchesRoute, serializeDraft, type PersistedEntryDraft } from './entryDraftPersistence.ts';
import type { Entry } from './types.ts';

const existingEntry = (): Entry => ({
  id: 7,
  epochDay: 20_000,
  timestamp: 123,
  mood: 3,
  note: 'ok day',
  dims: { masculinity: 40 },
  tags: ['e-happy'],
  photos: [
    { id: 'p1', fileName: 'p1.jpg' },
    { id: 'p2', fileName: 'p2.jpg' }
  ],
  bodyRegions: { chest: 60 }
});

test('serializeDraft keeps only the storage-shaped, JSON-safe fields', () => {
  const draft = createEntryDraft(20_001);
  draft.setMood(4);
  draft.setNote('hi');
  draft.toggleTag('e-happy');

  const persisted = serializeDraft(draft);
  assert.deepEqual(persisted, {
    id: undefined,
    epochDay: 20_001,
    timestamp: 0,
    mood: 4,
    note: 'hi',
    dims: {},
    tags: ['e-happy'],
    bodyRegions: {},
    removedPhotoIds: []
  });
});

test('a persisted draft for a new entry matches by day, not by id', () => {
  const persisted: PersistedEntryDraft = {
    id: undefined,
    epochDay: 20_001,
    timestamp: 0,
    mood: null,
    note: '',
    dims: {},
    tags: [],
    bodyRegions: {},
    removedPhotoIds: []
  };
  assert.equal(draftMatchesRoute(persisted, undefined, 20_001), true);
  assert.equal(draftMatchesRoute(persisted, undefined, 20_002), false);
  assert.equal(draftMatchesRoute(persisted, 7, 20_001), false);
});

test('a persisted draft for an existing entry matches by id, regardless of day', () => {
  const persisted: PersistedEntryDraft = {
    id: 7,
    epochDay: 20_000,
    timestamp: 123,
    mood: 3,
    note: '',
    dims: {},
    tags: [],
    bodyRegions: {},
    removedPhotoIds: []
  };
  assert.equal(draftMatchesRoute(persisted, 7, 20_000), true);
  assert.equal(draftMatchesRoute(persisted, 8, 20_000), false);
  assert.equal(draftMatchesRoute(persisted, undefined, 20_000), false);
});

test('applying a persisted draft overlays mood, note, dims, tags and body regions', () => {
  const draft = createEntryDraft(20_001);
  const persisted: PersistedEntryDraft = {
    id: undefined,
    epochDay: 20_001,
    timestamp: 0,
    mood: 5,
    note: 'restored',
    dims: { femininity: 70 },
    tags: ['e-happy'],
    bodyRegions: { chest: 30 },
    removedPhotoIds: []
  };

  applyPersistedDraft(draft, persisted);

  assert.equal(draft.mood, 5);
  assert.equal(draft.note, 'restored');
  assert.deepEqual(draft.dims, { femininity: 70 });
  assert.deepEqual(draft.tags, ['e-happy']);
  assert.deepEqual(draft.bodyRegions, { chest: 30 });
});

test('applying a persisted draft drops stored photos the user had already removed', () => {
  const draft = createEntryDraft(20_000, existingEntry());
  assert.equal(draft.photos.length, 2);

  const persisted: PersistedEntryDraft = {
    id: 7,
    epochDay: 20_000,
    timestamp: 123,
    mood: 3,
    note: 'ok day',
    dims: { masculinity: 40 },
    tags: ['e-happy'],
    bodyRegions: { chest: 60 },
    removedPhotoIds: ['p1']
  };

  applyPersistedDraft(draft, persisted);

  assert.deepEqual(draft.removedPhotoIds, ['p1']);
  assert.deepEqual(
    draft.photos.map((p) => (p.kind === 'stored' ? p.photo.id : p.kind)),
    ['p2']
  );
});
