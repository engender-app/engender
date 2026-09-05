import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  areaHidden,
  areaQuiet,
  areaStateResting,
  FINISHABLE_AREAS,
  NOT_FINISHABLE,
  SUSPENDABLE_AREAS,
  type AreaStates
} from './areaState.ts';
import { cycleTrackingVisible } from './cycleTracking.ts';
import type { RegimenEpisode } from './types.ts';

const TODAY = 20000;

test('an area with no row is neither hidden nor quiet, and nothing had to say so', () => {
  const states: AreaStates = {};

  assert.equal(areaHidden('measurements', states), false);
  assert.equal(areaQuiet('measurements', states, TODAY), false);
  assert.deepEqual(Object.keys(states), []);
});

test('hidden and finished are independent: either one alone makes an area quiet', () => {
  const onlyHidden: AreaStates = { measurements: { hidden: true, finishedEpochDay: null, suspendedEpochDay: null } };
  const onlyFinished: AreaStates = { measurements: { hidden: false, finishedEpochDay: 19900, suspendedEpochDay: null } };

  assert.equal(areaHidden('measurements', onlyHidden), true);
  assert.equal(areaQuiet('measurements', onlyHidden, TODAY), true);

  // The whole point of a finished area: it is still readable, so finishing
  // it did not hide it.
  assert.equal(areaHidden('measurements', onlyFinished), false);
  assert.equal(areaQuiet('measurements', onlyFinished, TODAY), true);
});

test('a finish day in the future has not happened yet', () => {
  const states: AreaStates = { wearSessions: { hidden: false, finishedEpochDay: TODAY + 1, suspendedEpochDay: null } };

  assert.equal(areaQuiet('wearSessions', states, TODAY), false);
  assert.equal(areaQuiet('wearSessions', states, TODAY + 1), true);
});

test('a suspended area is quiet, the same as hidden or finished, and a future suspend day has not happened yet', () => {
  const states: AreaStates = {
    hairRemovalSessions: { hidden: false, finishedEpochDay: null, suspendedEpochDay: TODAY - 1 }
  };
  const future: AreaStates = {
    hairRemovalSessions: { hidden: false, finishedEpochDay: null, suspendedEpochDay: TODAY + 1 }
  };

  assert.equal(areaHidden('hairRemovalSessions', states), false);
  assert.equal(areaQuiet('hairRemovalSessions', states, TODAY), true);
  assert.equal(areaQuiet('hairRemovalSessions', future, TODAY), false);
});

test('the three suspendable areas are the two named cases, voice fronting both of its sections', () => {
  assert.deepEqual([...SUSPENDABLE_AREAS].sort(), ['hairRemovalSessions', 'voiceBenchmarks', 'voicePracticeTakes']);
  for (const area of SUSPENDABLE_AREAS) {
    assert.ok(FINISHABLE_AREAS.includes(area), `${area} is suspendable but not finishable`);
  }
});

test('areaStateResting is true only where every field is at rest', () => {
  assert.equal(areaStateResting({ hidden: false, finishedEpochDay: null, suspendedEpochDay: null }), true);
  assert.equal(areaStateResting({ hidden: true, finishedEpochDay: null, suspendedEpochDay: null }), false);
  assert.equal(areaStateResting({ hidden: false, finishedEpochDay: 19900, suspendedEpochDay: null }), false);
  assert.equal(areaStateResting({ hidden: false, finishedEpochDay: null, suspendedEpochDay: 19900 }), false);
});

test('one area answering does not answer for another', () => {
  const states: AreaStates = { hairStages: { hidden: true, finishedEpochDay: 19000, suspendedEpochDay: null } };

  assert.equal(areaQuiet('hairStages', states, TODAY), true);
  assert.equal(areaQuiet('hairPhotos', states, TODAY), false);
});

test('the eleven finishable areas are the nine that were approved plus ticket 10s practice take and ticket 12s dilation, voice fronting two of them', () => {
  assert.deepEqual([...FINISHABLE_AREAS].sort(), [
    'hairPhotos',
    'hairRemovalSessions',
    'hairStages',
    'measurements',
    'personalEffects',
    'sideEffects',
    'sizeRecords',
    'taperSessions',
    'voiceBenchmarks',
    'voicePracticeTakes',
    'wearSessions'
  ]);
  assert.equal(FINISHABLE_AREAS.filter((area) => area.startsWith('voice')).length, 2);
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

/* ADR-0043's rule is one-directional on purpose: a testosterone regimen or
   the explicit preference adds the cycle row back, and no preference is what
   hides it, because read cold an unconditional cycle row is a dysphoria
   trigger. A uniform bidirectional flag defaulting to shown would delete both
   the asymmetry and the data-driven unhide, so cycle keeps its own gate and
   this record does not reach it. The compile error is the load-bearing half;
   the four answers below are what a future refactor would have to break. */
test('cycle tracking keeps its own gate: no row here changes what it answers', () => {
  assert.match(NOT_FINISHABLE.cycleEvents, /ADR-0043/);

  // @ts-expect-error cycleEvents is not a key of this record at all (ADR-0043),
  // so neither gate below can be asked about it and no state can be built that
  // would answer. That is what stops the record reversing a one-directional
  // rule; areaStates.test.ts covers the row a foreign archive could carry.
  const states: AreaStates = { cycleEvents: { hidden: true, finishedEpochDay: 19000, suspendedEpochDay: null } };
  void states;

  const testosterone: RegimenEpisode = {
    id: 'ep',
    drug: 'Testosterone cypionate',
    ester: 'cypionate',
    dose: 100,
    doseUnit: 'mg',
    route: 'im',
    interval: 'weekly',
    startEpochDay: 19000,
    endEpochDay: null
  };
  const noon = 19500 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000;

  assert.equal(cycleTrackingVisible([], noon, false), false);
  assert.equal(cycleTrackingVisible([], noon, true), true);
  assert.equal(cycleTrackingVisible([testosterone], noon, false), true);
  assert.equal(cycleTrackingVisible([testosterone], noon, true), true);
});
