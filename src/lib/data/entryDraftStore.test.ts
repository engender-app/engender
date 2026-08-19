/* What the draft mirror will accept back off storage. Everything here is
   about rejecting a snapshot rather than reading one: a draft that fails
   validation is discarded, which costs one unsaved screen, while a draft
   that is wrongly accepted reaches the editor half-shaped. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { isPersistedEntryDraft } from './entryDraftStore.ts';

const draft = (bodyRegions: unknown) => ({
  id: undefined,
  epochDay: 1,
  timestamp: 0,
  mood: 3,
  note: '',
  dims: {},
  tags: [],
  bodyRegions,
  removedPhotoIds: [],
  removedRecordingIds: [],
  removedVideoIds: []
});

test('a region carrying both axes, one axis, or neither is accepted', () => {
  assert.equal(isPersistedEntryDraft(draft({ chest: { dysphoria: 40, euphoria: 65 } })), true);
  assert.equal(isPersistedEntryDraft(draft({ chest: { dysphoria: null, euphoria: 65 } })), true);
  // The shape a picked-but-untouched region has while the editor is open.
  assert.equal(isPersistedEntryDraft(draft({ chest: { dysphoria: null, euphoria: null } })), true);
  assert.equal(isPersistedEntryDraft(draft({})), true);
});

test('a draft saved before a region carried two axes is rejected, not half-read', () => {
  // The pre-ticket-31 shape stored a bare number per region. Accepting it
  // would index an axis off a number and send undefined down to the insert.
  assert.equal(isPersistedEntryDraft(draft({ chest: 70 })), false);
  assert.equal(isPersistedEntryDraft(draft({ chest: null })), false);
  assert.equal(isPersistedEntryDraft(draft({ chest: { dysphoria: 'a lot', euphoria: null } })), false);
});
