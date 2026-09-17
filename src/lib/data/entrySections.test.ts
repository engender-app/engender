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

test('the five folded sections, in the order the chips are drawn (mode and gender stay on the page)', () => {
  assert.deepEqual(ENTRY_SECTIONS, ['tags', 'body', 'photos', 'voice', 'video']);
});

test('a chip over an empty section states nothing', () => {
  const draft = createEntryDraft(20_001);
  for (const section of ENTRY_SECTIONS) assert.equal(sectionState(section, draft), null);
});

test('tags, photos, voice and video read a count', () => {
  const draft = createEntryDraft(20_001);
  draft.toggleTag('a');
  draft.toggleTag('b');
  draft.toggleTag('c');
  draft.toggleTag('d');
  assert.equal(sectionState('tags', draft), '4');
  draft.addPhoto({ full: new Uint8Array(1), thumb: new Uint8Array(1), width: 1, height: 1 } as never);
  draft.addPhoto({ full: new Uint8Array(1), thumb: new Uint8Array(1), width: 1, height: 1 } as never);
  assert.equal(sectionState('photos', draft), '2');
  draft.addRecording(new Uint8Array(1));
  assert.equal(sectionState('voice', draft), '1');
  draft.addVideo(new Uint8Array(1));
  assert.equal(sectionState('video', draft), '1');
});

test('body map counts regions that say something, not regions merely on screen', () => {
  const draft = createEntryDraft(20_001);
  draft.toggleBodyRegion('chest');
  /* A region picked and left at the midpoint is a slider waiting for input
     (bodyMap.ts, ticket 31), and is dropped on save - so it is not content
     the chip should claim. */
  assert.equal(draft.bodyRegions.chest, BODY_REGION_MIDPOINT);
  assert.equal(sectionState('body', draft), null);
  draft.setBodyRegionFeeling('chest', 20);
  draft.toggleBodyRegion('face');
  draft.setBodyRegionFeeling('face', 80);
  assert.equal(sectionState('body', draft), '2');
});
