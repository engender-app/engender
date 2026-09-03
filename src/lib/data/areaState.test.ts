import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  areaHidden,
  areaQuiet,
  FINISHABLE_AREAS,
  NOT_FINISHABLE,
  type AreaStates
} from './areaState.ts';

const TODAY = 20000;

test('an area with no row is neither hidden nor quiet, and nothing had to say so', () => {
  const states: AreaStates = {};

  assert.equal(areaHidden('measurements', states), false);
  assert.equal(areaQuiet('measurements', states, TODAY), false);
  assert.deepEqual(Object.keys(states), []);
});

test('hidden and finished are independent: either one alone makes an area quiet', () => {
  const onlyHidden: AreaStates = { measurements: { hidden: true, finishedEpochDay: null } };
  const onlyFinished: AreaStates = { measurements: { hidden: false, finishedEpochDay: 19900 } };

  assert.equal(areaHidden('measurements', onlyHidden), true);
  assert.equal(areaQuiet('measurements', onlyHidden, TODAY), true);

  // The whole point of a finished area: it is still readable, so finishing
  // it did not hide it.
  assert.equal(areaHidden('measurements', onlyFinished), false);
  assert.equal(areaQuiet('measurements', onlyFinished, TODAY), true);
});

test('a finish day in the future has not happened yet', () => {
  const states: AreaStates = { wearSessions: { hidden: false, finishedEpochDay: TODAY + 1 } };

  assert.equal(areaQuiet('wearSessions', states, TODAY), false);
  assert.equal(areaQuiet('wearSessions', states, TODAY + 1), true);
});

test('one area answering does not answer for another', () => {
  const states: AreaStates = { hairStages: { hidden: true, finishedEpochDay: 19000 } };

  assert.equal(areaQuiet('hairStages', states, TODAY), true);
  assert.equal(areaQuiet('hairPhotos', states, TODAY), false);
});

test('the nine finishable areas are the nine that were approved, voice among them once', () => {
  assert.deepEqual([...FINISHABLE_AREAS].sort(), [
    'hairPhotos',
    'hairRemovalSessions',
    'hairStages',
    'measurements',
    'personalEffects',
    'sideEffects',
    'sizeRecords',
    'voiceBenchmarks',
    'wearSessions'
  ]);
  assert.equal(FINISHABLE_AREAS.filter((area) => area.startsWith('voice')).length, 1);
});

test('every area that is not finishable says why, and no area answers twice', () => {
  const excused = Object.keys(NOT_FINISHABLE);

  for (const area of FINISHABLE_AREAS) {
    assert.ok(!excused.includes(area), `${area} is both finishable and excused`);
  }
  for (const [area, reason] of Object.entries(NOT_FINISHABLE)) {
    assert.ok(reason.length > 20, `${area}'s reason is too short to be one: ${reason}`);
  }
});
