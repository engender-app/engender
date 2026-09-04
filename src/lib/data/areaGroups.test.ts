import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  AREA_GROUPS,
  AREA_GROUP_KEYS,
  FINISH_SUGGESTION_QUIET_DAYS,
  finishedGroups,
  groupDeclined,
  groupFinishedOn,
  groupLastWrite,
  shouldOfferFinish
} from './areaGroups.ts';
import { FINISHABLE_AREAS, type AreaStates } from './areaState.ts';

const TODAY = 20000;

const finished = (epochDay: number) => ({ hidden: false, finishedEpochDay: epochDay });

test('every finishable area is grouped, and none of them twice', () => {
  const grouped = AREA_GROUP_KEYS.flatMap((key) => [...AREA_GROUPS[key]]);

  assert.deepEqual([...grouped].sort(), [...FINISHABLE_AREAS].sort());
  assert.equal(new Set(grouped).size, grouped.length);
});

test('hair progress is the one group that fronts two areas', () => {
  const several = AREA_GROUP_KEYS.filter((key) => AREA_GROUPS[key].length > 1);

  assert.deepEqual(several, ['hair-progress']);
  assert.deepEqual([...AREA_GROUPS['hair-progress']], ['hairStages', 'hairPhotos']);
});

test('a group of one is finished on the day its area is', () => {
  const states: AreaStates = { measurements: finished(19800) };

  assert.equal(groupFinishedOn('measurements', states), 19800);
  assert.equal(groupFinishedOn('sizes', states), null);
});

test('a group fronting two areas is not finished until both are', () => {
  const half: AreaStates = { hairStages: finished(19800) };
  const whole: AreaStates = { hairStages: finished(19800), hairPhotos: finished(19800) };

  assert.equal(groupFinishedOn('hair-progress', half), null);
  assert.equal(groupFinishedOn('hair-progress', whole), 19800);
});

test('two areas finished on days that disagree read as the later one', () => {
  const states: AreaStates = { hairStages: finished(19800), hairPhotos: finished(19850) };

  assert.equal(groupFinishedOn('hair-progress', states), 19850);
});

test('hiding an area does not finish it', () => {
  const states: AreaStates = { wearSessions: { hidden: true, finishedEpochDay: null } };

  assert.equal(groupFinishedOn('wear', states), null);
});

test('the finished groups come back oldest first, each named once', () => {
  const states: AreaStates = {
    wearSessions: finished(19900),
    measurements: finished(19700),
    hairStages: finished(19800),
    hairPhotos: finished(19800)
  };

  assert.deepEqual(finishedGroups(states), [
    { key: 'measurements', epochDay: 19700 },
    { key: 'hair-progress', epochDay: 19800 },
    { key: 'wear', epochDay: 19900 }
  ]);
});

test("a group's last write is the latest of its areas, and null when none has one", () => {
  assert.equal(groupLastWrite('hair-progress', { hairStages: 19000, hairPhotos: 19500 }), 19500);
  assert.equal(groupLastWrite('hair-progress', { hairStages: 19000, hairPhotos: null }), 19000);
  assert.equal(groupLastWrite('hair-progress', { hairStages: null, hairPhotos: null }), null);
});

test('the offer waits until an area has been quiet for the whole window', () => {
  const offer = (lastWriteEpochDay: number) =>
    shouldOfferFinish('measurements', {
      states: {},
      lastWrites: { measurements: lastWriteEpochDay },
      declined: [],
      todayEpochDay: TODAY
    });

  assert.equal(offer(TODAY - FINISH_SUGGESTION_QUIET_DAYS + 1), false);
  assert.equal(offer(TODAY - FINISH_SUGGESTION_QUIET_DAYS), true);
});

test('an area nobody has ever written in is never offered', () => {
  assert.equal(
    shouldOfferFinish('measurements', {
      states: {},
      lastWrites: { measurements: null },
      declined: [],
      todayEpochDay: TODAY
    }),
    false
  );
});

test('a no is taken permanently', () => {
  const input = {
    states: {},
    lastWrites: { measurements: 19000 },
    // The section name, which is what the preference stores - never the hub
    // row key (ADR-0052).
    declined: ['measurements'],
    todayEpochDay: TODAY
  };

  assert.equal(shouldOfferFinish('measurements', input), false);
  assert.equal(shouldOfferFinish('measurements', { ...input, todayEpochDay: TODAY + 3650 }), false);
});

test('a no is stored against sections, so a row key alone declines nothing', () => {
  /* The row key and the section name happen to be the same string for six of
     the eight groups, so this uses one of the two where they differ. A build
     that stored rows would pass on 'sizes' and this is what catches it. */
  assert.deepEqual([...AREA_GROUPS.sizes], ['sizeRecords']);

  assert.equal(groupDeclined('sizes', ['sizeRecords']), true);
  assert.equal(groupDeclined('sizes', ['sizes']), false);
  assert.equal(
    shouldOfferFinish('sizes', {
      states: {},
      lastWrites: { sizeRecords: 19000 },
      declined: ['sizes'],
      todayEpochDay: TODAY
    }),
    true,
    'a stored hub row is not a stored area'
  );
});

test('a group fronting two areas reads as declined from either of them', () => {
  /* Declining writes both, so the two agree today. They can only disagree
     after a regroup, and there the safe answer is still "no": re-asking is
     the failure the preference exists to prevent. */
  assert.equal(groupDeclined('hair-progress', ['hairStages', 'hairPhotos']), true);
  assert.equal(groupDeclined('hair-progress', ['hairStages']), true);
  assert.equal(groupDeclined('hair-progress', []), false);
});

test('a key this build has never heard of declines nothing', () => {
  assert.equal(groupDeclined('measurements', ['somethingElse']), false);
});

test('an area that is already quiet is not asked about', () => {
  const lastWrites = { measurements: 19000 };

  assert.equal(
    shouldOfferFinish('measurements', {
      states: { measurements: finished(19100) },
      lastWrites,
      declined: [],
      todayEpochDay: TODAY
    }),
    false
  );
  assert.equal(
    shouldOfferFinish('measurements', {
      states: { measurements: { hidden: true, finishedEpochDay: null } },
      lastWrites,
      declined: [],
      todayEpochDay: TODAY
    }),
    false
  );
});

test('one area of a pair still being written in holds the offer back', () => {
  const input = {
    states: {} as AreaStates,
    declined: [] as string[],
    todayEpochDay: TODAY
  };

  assert.equal(
    shouldOfferFinish('hair-progress', {
      ...input,
      lastWrites: { hairStages: 19000, hairPhotos: TODAY - 1 }
    }),
    false
  );
  assert.equal(
    shouldOfferFinish('hair-progress', {
      ...input,
      lastWrites: { hairStages: 19000, hairPhotos: null }
    }),
    true
  );
});
