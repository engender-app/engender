/* The interval mood pattern area (phase 5 ticket 09): the area that
   stitches stats' day averages to the dose log
   (../intervalMoodPattern.ts owns the bucketing math and is tested without
   a driver). */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { startOfDayTimestamp } from '../epochDay.ts';
import { journalWithBuiltIns } from './test-support.ts';

const DAY_0 = 20000;
const at = (epochDay: number, hour = 8) => startOfDayTimestamp(epochDay) + hour * 3600000;

async function injection(journal: Awaited<ReturnType<typeof journalWithBuiltIns>>['journal'], epochDay: number) {
  await journal.doses.upsertDose({
    timestamp: at(epochDay),
    route: 'im',
    dose: 4,
    doseUnit: 'mg',
    injectionSite: 'thigh-left',
    vehicle: 'oil'
  });
}

test('dayOfInterval buckets mood by day of interval across completed injections', async () => {
  const { journal } = await journalWithBuiltIns();
  // Four injections span three completed intervals (0-14, 14-28, 28-42);
  // the span from the fourth injection onward is still ongoing.
  for (const start of [DAY_0, DAY_0 + 14, DAY_0 + 28, DAY_0 + 42]) {
    await injection(journal, start);
    await journal.entries.upsertEntry({ epochDay: start, mood: 4 });
  }
  await journal.entries.upsertEntry({ epochDay: DAY_0 + 50, mood: 1 }); // inside the ongoing interval - left out

  const pattern = await journal.intervalMoodPattern.dayOfInterval(DAY_0, DAY_0 + 50);

  assert.deepEqual(pattern, [{ position: 1, value: 4, count: 3 }]);
});

test('a skipped injection is not a dose day and starts no interval of its own', async () => {
  const { journal } = await journalWithBuiltIns();
  for (const start of [DAY_0, DAY_0 + 14, DAY_0 + 28, DAY_0 + 42]) {
    await injection(journal, start);
    await journal.entries.upsertEntry({ epochDay: start, mood: 4 });
  }
  await journal.doses.upsertDose({
    timestamp: at(DAY_0 + 7),
    route: 'im',
    dose: 4,
    doseUnit: 'mg',
    injectionSite: 'thigh-left',
    vehicle: 'oil',
    status: 'skipped'
  });
  await journal.entries.upsertEntry({ epochDay: DAY_0 + 7, mood: 1 });

  const pattern = await journal.intervalMoodPattern.dayOfInterval(DAY_0, DAY_0 + 50);

  // If the skipped dose had split day 0-14 into two intervals, day 7's
  // mood would pull position 1's average down to 5.25 - it does not.
  assert.deepEqual(pattern, [{ position: 1, value: 4, count: 3 }]);
});

test('with nothing logged, the range comes back with no points rather than throwing', async () => {
  const { journal } = await journalWithBuiltIns();

  const pattern = await journal.intervalMoodPattern.dayOfInterval(DAY_0, DAY_0 + 28);

  assert.deepEqual(pattern, []);
});

test('byCustomInterval folds mood history by a chosen interval length, with no injections at all', async () => {
  const { journal } = await journalWithBuiltIns();
  // A multiple of 14, so position 1 falls on it - the fold anchors to the
  // epoch itself, not to this test's own range.
  const BASE = 20006;
  for (const day of [BASE, BASE + 14, BASE + 28]) {
    await journal.entries.upsertEntry({ epochDay: day, mood: 5 });
  }
  for (const day of [BASE + 7, BASE + 21]) {
    await journal.entries.upsertEntry({ epochDay: day, mood: 2 });
  }

  const pattern = await journal.intervalMoodPattern.byCustomInterval(BASE, BASE + 28, 14);

  // Day 0, 14 and 28 fold to position 1 (avg (5+5+5)/3 = 5); day 7 and 21
  // fold to position 8 but that is only two days - below the floor.
  assert.deepEqual(pattern, [{ position: 1, value: 5, count: 3 }]);
});

test('all history as MIN_SAFE_INTEGER still reaches the dose log, which is dated by timestamp', async () => {
  const { journal } = await journalWithBuiltIns();
  for (const start of [DAY_0, DAY_0 + 14, DAY_0 + 28, DAY_0 + 42]) {
    await injection(journal, start);
    await journal.entries.upsertEntry({ epochDay: start, mood: 4 });
  }

  /* The bound `/stats` actually passes. `dayAverages` compares an
     epoch_day column and takes a sentinel; `getDoses` turns the bound into
     a timestamp, and `startOfDayTimestamp(MIN_SAFE_INTEGER)` is NaN, so
     before the clamp this returned no doses, no intervals and no
     positions - the card drew its not-enough-data copy over a journal with
     four injections in it. */
  const pattern = await journal.intervalMoodPattern.dayOfInterval(Number.MIN_SAFE_INTEGER, DAY_0 + 50);

  assert.deepEqual(pattern, [{ position: 1, value: 4, count: 3 }]);
});

test('"ever" stops more than two years back, so an old completed interval no longer corroborates a recent one', async () => {
  const { journal } = await journalWithBuiltIns();
  // Three completed intervals, all more than two years before `today` below -
  // outside the lookback window this ticket adds.
  for (const start of [DAY_0, DAY_0 + 14, DAY_0 + 28, DAY_0 + 42]) {
    await injection(journal, start);
    await journal.entries.upsertEntry({ epochDay: start, mood: 4 });
  }
  // One completed interval close to `today` - on its own, below the floor.
  const RECENT = DAY_0 + 42 + 800;
  await injection(journal, RECENT);
  await injection(journal, RECENT + 14);
  await journal.entries.upsertEntry({ epochDay: RECENT, mood: 1 });
  const today = RECENT + 14 + 5;

  const pattern = await journal.intervalMoodPattern.dayOfInterval(Number.MIN_SAFE_INTEGER, today);

  // Combined with the three old intervals this would clear the floor and
  // report position 1 at an average of 3.25 - the old intervals are meant
  // to be out of reach instead.
  assert.deepEqual(pattern, []);
});

test('byCustomInterval\'s "ever" stops more than two years back too', async () => {
  const { journal } = await journalWithBuiltIns();
  // A multiple of 14, so position 1 falls on it - three days folding to
  // that position, all more than two years before `today` below.
  const BASE = 20006;
  for (const day of [BASE, BASE + 14, BASE + 28]) {
    await journal.entries.upsertEntry({ epochDay: day, mood: 5 });
  }
  // One more multiple of 14, close to `today` - on its own, below the floor.
  const recentFold = BASE + 14 * 60; // 840 days on from BASE
  await journal.entries.upsertEntry({ epochDay: recentFold, mood: 1 });
  const today = recentFold + 5;

  const pattern = await journal.intervalMoodPattern.byCustomInterval(Number.MIN_SAFE_INTEGER, today, 14);

  // Combined with the three old days this would clear the floor - the old
  // days are meant to be out of reach instead.
  assert.deepEqual(pattern, []);
});
