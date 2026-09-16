/* The editor's chip row (phase 11 ticket 19): which section each chip
   opens, and what a chip says about its section's current value. The
   words are the component's (labels come from the catalogue); what is
   tested here is the value a chip states, or the null that means "read
   the name alone". */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createEntryDraft } from './entryDraft.ts';
import { ENTRY_SECTIONS, sectionState } from './entrySections.ts';
import { BODY_REGION_MIDPOINT } from './bodyMap.ts';

const ctx = { presentationName: null as string | null, dimOrder: ['femininity', 'masculinity'] };

test('the seven sections, in the order the chips are drawn', () => {
  assert.deepEqual(ENTRY_SECTIONS, ['mode', 'gender', 'tags', 'body', 'photos', 'voice', 'video']);
});

test('a chip over an empty section states nothing', () => {
  const draft = createEntryDraft(20_001);
  for (const section of ENTRY_SECTIONS) assert.equal(sectionState(section, draft, ctx), null);
});

test('mode reads the presentation by name, never by id', () => {
  const draft = createEntryDraft(20_001);
  draft.setPresentation('femme');
  assert.equal(sectionState('mode', draft, { ...ctx, presentationName: 'Femme' }), 'Femme');
  /* A presentation the vocabulary no longer names - hidden, or deleted -
     is not restated as its id. */
  assert.equal(sectionState('mode', draft, ctx), null);
});

test('gender reads the set scales in the ticked order, then extras kept from the entry', () => {
  const draft = createEntryDraft(20_001);
  draft.setDim('masculinity', 87);
  draft.setDim('femininity', 55);
  assert.equal(sectionState('gender', draft, ctx), '55 / 87');
  draft.setDim('voice_comfort', 12);
  assert.equal(sectionState('gender', draft, ctx), '55 / 87 / 12');
  /* One scale set of two ticked: only what is set is stated. */
  const one = createEntryDraft(20_001);
  one.setDim('masculinity', 40);
  assert.equal(sectionState('gender', one, ctx), '40');
});

test('tags, photos, voice and video read a count', () => {
  const draft = createEntryDraft(20_001);
  draft.toggleTag('a');
  draft.toggleTag('b');
  draft.toggleTag('c');
  draft.toggleTag('d');
  assert.equal(sectionState('tags', draft, ctx), '4');
  draft.addPhoto({ full: new Uint8Array(1), thumb: new Uint8Array(1), width: 1, height: 1 } as never);
  draft.addPhoto({ full: new Uint8Array(1), thumb: new Uint8Array(1), width: 1, height: 1 } as never);
  assert.equal(sectionState('photos', draft, ctx), '2');
  draft.addRecording(new Uint8Array(1));
  assert.equal(sectionState('voice', draft, ctx), '1');
  draft.addVideo(new Uint8Array(1));
  assert.equal(sectionState('video', draft, ctx), '1');
});

test('body map counts regions that say something, not regions merely on screen', () => {
  const draft = createEntryDraft(20_001);
  draft.toggleBodyRegion('chest');
  /* A region picked and left at the midpoint is a slider waiting for input
     (bodyMap.ts, ticket 31), and is dropped on save - so it is not content
     the chip should claim. */
  assert.equal(draft.bodyRegions.chest, BODY_REGION_MIDPOINT);
  assert.equal(sectionState('body', draft, ctx), null);
  draft.setBodyRegionFeeling('chest', 20);
  draft.toggleBodyRegion('face');
  draft.setBodyRegionFeeling('face', 80);
  assert.equal(sectionState('body', draft, ctx), '2');
});
