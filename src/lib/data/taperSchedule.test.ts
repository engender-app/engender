const MAX_TAPER_DAYS = 3650;
/* Expected taper sessions: pure arithmetic over a start day and a stage
   sequence (phase 8 features ticket 12). No clock, no database - every case
   here is a table of days. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { MAX_TIMES_PER_DAY, dilationGated, expectedSessionDays, sessionsExpectedOn, stageOn, stagesFromInput } from './taperSchedule.ts';
import type { TaperStage } from './types.ts';
import { hubRowsMatching } from './hubRows.ts';

const taper = (startEpochDay: number, stages: TaperStage[]) => ({ startEpochDay, stages });

test('a single stage expects a session every N days for its duration', () => {
  const days = expectedSessionDays(taper(100, [{ everyNDays: 1, days: 5 }]), 200);
  assert.deepEqual(days, [100, 101, 102, 103, 104]);
});

test('a less frequent stage skips the days between', () => {
  const days = expectedSessionDays(taper(100, [{ everyNDays: 2, days: 6 }]), 200);
  assert.deepEqual(days, [100, 102, 104]);
});

test('the next stage starts the day the previous one ends, not after it', () => {
  const days = expectedSessionDays(
    taper(100, [
      { everyNDays: 1, days: 3 }, // 100, 101, 102
      { everyNDays: 2, days: 6 } // 103, 105
    ]),
    200
  );
  assert.deepEqual(days, [100, 101, 102, 103, 105, 107]);
});

test('today cuts the schedule off, mid-stage', () => {
  const days = expectedSessionDays(
    taper(100, [
      { everyNDays: 1, days: 7 }, // 100..106
      { everyNDays: 2, days: 14 } // 107, 109, 111, ...
    ]),
    110
  );
  assert.deepEqual(days, [100, 101, 102, 103, 104, 105, 106, 107, 109]);
});

test('a taper that has not started yet expects nothing', () => {
  assert.deepEqual(expectedSessionDays(taper(100, [{ everyNDays: 1, days: 5 }]), 99), []);
});

test('a stage with no frequency expects no sessions but still holds its days for the next stage', () => {
  const days = expectedSessionDays(
    taper(100, [
      { everyNDays: 0, days: 5 }, // a rest stage: nothing expected for 5 days
      { everyNDays: 1, days: 2 } // then 105, 106
    ]),
    200
  );
  assert.deepEqual(days, [105, 106]);
});

test('a stage with no duration is skipped entirely', () => {
  const days = expectedSessionDays(
    taper(100, [
      { everyNDays: 1, days: 0 },
      { everyNDays: 1, days: 2 }
    ]),
    200
  );
  assert.deepEqual(days, [100, 101]);
});

test('an edit to an earlier stage shifts every later stage, since nothing is stored between edits', () => {
  const original = taper(100, [
    { everyNDays: 1, days: 7 },
    { everyNDays: 3, days: 30 }
  ]);
  const edited = taper(100, [
    { everyNDays: 1, days: 3 }, // the surgeon shortened the daily stage
    { everyNDays: 3, days: 30 }
  ]);

  const before = expectedSessionDays(original, 105);
  const after = expectedSessionDays(edited, 105);

  // Unchanged: the daily stage's first three days.
  assert.deepEqual(before.slice(0, 3), [100, 101, 102]);
  assert.deepEqual(after.slice(0, 3), [100, 101, 102]);
  // Diverges from day 103 on: the original is still in its daily stage,
  // the edit has already moved to the every-third-day one.
  assert.deepEqual(before.slice(3), [103, 104, 105]);
  assert.deepEqual(after.slice(3), [103]);
});

/* The schedule editor's fields are `type=number bind:value`, so an emptied
   field reaches the page as null, not '' (after-release ticket 01, L07-03).
   A cleared frequency used to pass as 0 and save a rest stage. */
test('a cleared, blank or non-numeric frequency is no frequency at all, and 0 is still a rest stage', () => {
  for (const missing of [null, undefined, '', '  ', 'abc', Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(stagesFromInput([{ everyNDays: missing, days: 5 }]), null, String(missing));
  }
  assert.deepEqual(stagesFromInput([{ everyNDays: 0, days: 5 }]), [{ everyNDays: 0, days: 5 }]);
  assert.deepEqual(stagesFromInput([{ everyNDays: '2', days: '7' }]), [{ everyNDays: 2, days: 7 }]);
});

test('a stage needs at least one day, and a negative frequency is refused', () => {
  assert.equal(stagesFromInput([{ everyNDays: 1, days: null }]), null);
  assert.equal(stagesFromInput([{ everyNDays: 1, days: 0 }]), null);
  assert.equal(stagesFromInput([{ everyNDays: -1, days: 3 }]), null);
  assert.equal(stagesFromInput([]), null);
});

/* Functional audit ticket 25: post-vaginoplasty schedules are given as
   "3 to 5 times a day", so a stage can expect several sessions on each of
   its days as well as one every N days. */
test('a times-a-day stage expects that many sessions on every one of its days', () => {
  const t = taper(100, [
    { everyNDays: 1, timesPerDay: 3, days: 3 }, // 100..102, three a day
    { everyNDays: 2, days: 4 } // 103, 105, one each
  ]);
  assert.deepEqual(expectedSessionDays(t, 200), [100, 101, 102, 103, 105]);
  assert.deepEqual(
    [99, 100, 101, 102, 103, 104, 105, 106, 107].map((day) => sessionsExpectedOn(t, day)),
    [0, 3, 3, 3, 1, 0, 1, 0, 0]
  );
});

test('a rest stage expects nothing on its days, whatever else it carries', () => {
  const t = taper(100, [{ everyNDays: 0, days: 2 }, { everyNDays: 1, timesPerDay: 4, days: 1 }]);
  assert.deepEqual([100, 101, 102].map((day) => sessionsExpectedOn(t, day)), [0, 0, 4]);
});

/* A schedule read off an archive is whatever the file says (taper.stages is
   JSON text on the wire), so a count the editor could never save reads as
   one session, or as the most the editor allows, rather than as a loop. */
test('a times-a-day count the editor could not have saved reads as one, or as the most it allows', () => {
  for (const [timesPerDay, expected] of [[0, 1], [-2, 1], [2.5, 1], ['3', 1], [Number.NaN, 1], [1e9, MAX_TIMES_PER_DAY]] as const) {
    const t = taper(100, [{ everyNDays: 1, timesPerDay: timesPerDay as number, days: 1 }]);
    assert.equal(sessionsExpectedOn(t, 100), expected, String(timesPerDay));
  }
});

test('the stage a day falls in, or null before the start, after the end, or in a stage with no days', () => {
  const daily = { everyNDays: 1, timesPerDay: 3, days: 2 };
  const everyOther = { everyNDays: 2, days: 4 };
  const t = taper(100, [daily, { everyNDays: 1, days: 0 }, everyOther]);
  assert.equal(stageOn(t, 99), null);
  assert.equal(stageOn(t, 100), daily);
  assert.equal(stageOn(t, 101), daily);
  assert.equal(stageOn(t, 102), everyOther);
  assert.equal(stageOn(t, 105), everyOther);
  assert.equal(stageOn(t, 106), null);
});

test('a times-a-day stage saves as a daily stage with its count, and needs a whole count the editor allows', () => {
  assert.deepEqual(stagesFromInput([{ everyNDays: '', timesPerDay: '3', days: '14' }]), [
    { everyNDays: 1, timesPerDay: 3, days: 14 }
  ]);
  assert.deepEqual(stagesFromInput([{ everyNDays: 2, timesPerDay: 1, days: 7 }]), [{ everyNDays: 1, timesPerDay: 1, days: 7 }]);
  for (const bad of [null, '', 0, -1, 2.5, MAX_TIMES_PER_DAY + 1, 'abc']) {
    assert.equal(stagesFromInput([{ everyNDays: 1, timesPerDay: bad, days: 7 }]), null, String(bad));
  }
  // An every-N-days stage still saves without a count.
  assert.deepEqual(stagesFromInput([{ everyNDays: 2, days: 7 }]), [{ everyNDays: 2, days: 7 }]);
});

/* Alicja, 2026-11-04: dilation should not be visible unless a vaginoplasty
   was logged. A custom procedure that opted in is the other way into the
   same eligibility (`dilationEligible`), a vulvoplasty or nothing is not. */
test('dilation is gated off until an eligible procedure exists', () => {
  const procedure = (kind: 'vaginoplasty' | 'vulvoplasty' | 'custom', dilationOptIn = false) => ({ kind, dilationOptIn });
  assert.equal(dilationGated({}, []).taperSessions?.hidden, true);
  assert.equal(dilationGated({}, [procedure('vulvoplasty'), procedure('custom')]).taperSessions?.hidden, true);
  assert.deepEqual(dilationGated({}, [procedure('vaginoplasty')]), {});
  assert.deepEqual(dilationGated({}, [procedure('custom', true)]), {});
});

test('the gate keeps what was already said about the dilation area', () => {
  const states = { taperSessions: { hidden: false, finishedEpochDay: 5, suspendedEpochDay: null }, wearSessions: { hidden: true, finishedEpochDay: null, suspendedEpochDay: null } };
  const gated = dilationGated(states, []);
  assert.deepEqual(gated.taperSessions, { hidden: true, finishedEpochDay: 5, suspendedEpochDay: null });
  assert.equal(gated.wearSessions, states.wearSessions);
});

test('a gated dilation row cannot be searched up on the More hub', () => {
  const reading = { todayEpochDay: 100, lastWrites: {}, forward: {}, states: dilationGated({}, []) };
  assert.deepEqual(hubRowsMatching(reading, 'dilation', (key) => key), []);
  assert.equal(hubRowsMatching({ ...reading, states: dilationGated({}, [{ kind: 'vaginoplasty', dilationOptIn: false }]) }, 'dilation', (key) => key).length, 1);
});

test('expectedSessionDays returns when a stage step vanishes beside its start day', () => {
  const days = expectedSessionDays(taper(-(2 ** 60), [{ everyNDays: 1, days: 2 ** 62 }]), 20000);
  assert.ok(days.length <= 1);
});

test('expectedSessionDays stops at the most days a taper can expect', () => {
  const days = expectedSessionDays(taper(0, [{ everyNDays: 1, days: 1e9 }]), 5_000_000);
  assert.equal(days.length, MAX_TAPER_DAYS);
});

test('stagesFromInput refuses fractions and what a restore would refuse', () => {
  assert.equal(stagesFromInput([{ everyNDays: 1, days: 2.5 }]), null);
  assert.equal(stagesFromInput([{ everyNDays: 1.5, days: 3 }]), null);
  assert.equal(stagesFromInput([{ everyNDays: 1, days: MAX_TAPER_DAYS + 1 }]), null);
  assert.equal(stagesFromInput(Array.from({ length: 53 }, () => ({ everyNDays: 1, days: 1 }))), null);
  assert.deepEqual(stagesFromInput([{ everyNDays: 0, days: MAX_TAPER_DAYS }]), [{ everyNDays: 0, days: MAX_TAPER_DAYS }]);
});
