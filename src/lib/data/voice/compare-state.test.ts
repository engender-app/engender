import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  orderAnchorsByJourney,
  stepCompareAnchor,
  toComparePair,
  toggleCompareAnchor
} from './compare-state.ts';
import type { DatedRecording } from '../journal/voiceRecordings.ts';

const recordings = (): DatedRecording[] => [
  { id: 'r1', fileName: 'r1.webm', epochDay: 20000 },
  { id: 'r2', fileName: 'r2.webm', epochDay: 20020 },
  { id: 'r3', fileName: 'r3.webm', epochDay: 20050 },
  { id: 'r4', fileName: 'r4.webm', epochDay: 20100 }
];

test('ordering is deterministic by journey chronology, not pick order', () => {
  assert.deepEqual(orderAnchorsByJourney(['r3', 'r1'], recordings()), ['r1', 'r3']);
  assert.deepEqual(orderAnchorsByJourney(['r4', 'r2'], recordings()), ['r2', 'r4']);
});

test('selecting a third anchor replaces the older anchor deterministically', () => {
  let selected: string[] = [];
  selected = toggleCompareAnchor(selected, 'r3', recordings());
  selected = toggleCompareAnchor(selected, 'r1', recordings());
  assert.deepEqual(selected, ['r1', 'r3']);

  selected = toggleCompareAnchor(selected, 'r4', recordings());
  assert.deepEqual(selected, ['r3', 'r4']);
});

test('tapping a selected anchor toggles it off into partial selection', () => {
  let selected = ['r2', 'r4'];
  selected = toggleCompareAnchor(selected, 'r2', recordings());
  assert.deepEqual(selected, ['r4']);
  assert.equal(toComparePair(selected, recordings()), null);
});

test('missing anchors are dropped instead of breaking compare state', () => {
  const list = recordings();
  const withoutR2 = list.filter((r) => r.id !== 'r2');

  assert.deepEqual(orderAnchorsByJourney(['r2', 'r4'], withoutR2), ['r4']);
  assert.equal(toComparePair(['r2', 'r4'], withoutR2), null);
});

test('stepCompareAnchor moves only inside bounds and never crosses sides', () => {
  const list = recordings();

  assert.deepEqual(stepCompareAnchor(['r1', 'r4'], 'left', 1, list), ['r2', 'r4']);
  assert.deepEqual(stepCompareAnchor(['r1', 'r4'], 'right', -1, list), ['r1', 'r3']);

  assert.deepEqual(stepCompareAnchor(['r1', 'r2'], 'left', 1, list), ['r1', 'r2']);
  assert.deepEqual(stepCompareAnchor(['r3', 'r4'], 'right', -1, list), ['r3', 'r4']);
});

test('toComparePair returns ordered indices for a full selection', () => {
  assert.deepEqual(toComparePair(['r4', 'r1'], recordings()), { left: 0, right: 3 });
});
