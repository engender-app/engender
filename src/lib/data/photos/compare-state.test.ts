import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  orderAnchorsByJourney,
  stepCompareAnchor,
  toComparePair,
  toggleCompareAnchor
} from './compare-state.ts';
import type { DatedPhoto } from '../journal/photos.ts';

const photos = (): DatedPhoto[] => [
  { id: 'p1', fileName: 'p1.jpg', epochDay: 20000, milestoneName: null },
  { id: 'p2', fileName: 'p2.jpg', epochDay: 20020, milestoneName: 'Started HRT' },
  { id: 'p3', fileName: 'p3.jpg', epochDay: 20050, milestoneName: null },
  { id: 'p4', fileName: 'p4.jpg', epochDay: 20100, milestoneName: 'Name change' }
];

test('ordering is deterministic by journey chronology, not pick order', () => {
  assert.deepEqual(orderAnchorsByJourney(['p3', 'p1'], photos()), ['p1', 'p3']);
  assert.deepEqual(orderAnchorsByJourney(['p4', 'p2'], photos()), ['p2', 'p4']);
});

test('selecting a third anchor replaces the older anchor deterministically', () => {
  let selected: string[] = [];
  selected = toggleCompareAnchor(selected, 'p3', photos());
  selected = toggleCompareAnchor(selected, 'p1', photos());
  assert.deepEqual(selected, ['p1', 'p3']);

  selected = toggleCompareAnchor(selected, 'p4', photos());
  assert.deepEqual(selected, ['p3', 'p4']);
});

test('tapping a selected anchor toggles it off into partial selection', () => {
  let selected = ['p2', 'p4'];
  selected = toggleCompareAnchor(selected, 'p2', photos());
  assert.deepEqual(selected, ['p4']);
  assert.equal(toComparePair(selected, photos()), null);
});

test('missing anchors are dropped instead of breaking compare state', () => {
  const list = photos();
  const withoutP2 = list.filter((p) => p.id !== 'p2');

  assert.deepEqual(orderAnchorsByJourney(['p2', 'p4'], withoutP2), ['p4']);
  assert.equal(toComparePair(['p2', 'p4'], withoutP2), null);
});

test('stepCompareAnchor moves only inside bounds and never crosses sides', () => {
  const list = photos();

  assert.deepEqual(stepCompareAnchor(['p1', 'p4'], 'left', 1, list), ['p2', 'p4']);
  assert.deepEqual(stepCompareAnchor(['p1', 'p4'], 'right', -1, list), ['p1', 'p3']);

  assert.deepEqual(stepCompareAnchor(['p1', 'p2'], 'left', 1, list), ['p1', 'p2']);
  assert.deepEqual(stepCompareAnchor(['p3', 'p4'], 'right', -1, list), ['p3', 'p4']);
});

test('toComparePair returns ordered indices for a full selection', () => {
  assert.deepEqual(toComparePair(['p4', 'p1'], photos()), { left: 0, right: 3 });
});