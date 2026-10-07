/* Expected taper sessions: pure arithmetic over a start day and a stage
   sequence (phase 8 features ticket 12). No clock, no database - every case
   here is a table of days. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { expectedSessionDays, stagesFromInput } from './taperSchedule.ts';
import type { TaperStage } from './types.ts';

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
