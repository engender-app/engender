/* The stats area (ticket 10, ADR-0012). The case this module exists to
   settle is the first one: the demo store answered "what is this metric's
   average" with three different numbers depending on which function was
   asked, because two of them multiplied mood by 20 to fake a 0-100 range
   and one did not. Everything here is in native units. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns } from './test-support.ts';

test('one metric, one number: every aggregate reports mood on the 1-to-5 range it was logged on', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, mood: 2, tags: ['e-tired'] });
  await journal.entries.upsertEntry({ epochDay: 101, mood: 4, tags: ['e-tired'] });
  await journal.entries.upsertEntry({ epochDay: 102, mood: 4, tags: ['e-tired'] });
  await journal.entries.upsertEntry({ epochDay: 103, mood: 2 });

  const series = await journal.stats.dayAverages('mood', 100, 103);
  assert.deepEqual(series.map((p) => p.value), [2, 4, 4, 2]);

  const [insight] = await journal.stats.tagInsights('mood', 100, 103);
  assert.equal(insight.withAvg, 10 / 3);
  assert.equal(insight.withoutAvg, 2);

  const recap = await journal.stats.recap(100, 103);
  assert.equal(recap.averageMood, 3);
});

test('a dimension reports in its own range, whatever that range is', async () => {
  const { journal } = await journalWithBuiltIns();
  const voice = await journal.dimensions.addCustomDimension({
    name: 'Voice comfort',
    low: 'strained',
    high: 'easy',
    min: 0,
    max: 10
  });
  await journal.entries.upsertEntry({ epochDay: 100, dims: { femininity: 70, [voice.key]: 3 } });

  assert.deepEqual(await journal.stats.dayAverages('femininity', 100, 100), [{ day: 100, value: 70, count: 1 }]);
  assert.deepEqual(await journal.stats.dayAverages(voice.key, 100, 100), [{ day: 100, value: 3, count: 1 }]);
});

test("a multi-entry day averages, and says how many entries it averaged", async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, timestamp: 1, mood: 2 });
  await journal.entries.upsertEntry({ epochDay: 100, timestamp: 2, mood: 5 });
  await journal.entries.upsertEntry({ epochDay: 101, mood: 4 });

  assert.deepEqual(await journal.stats.dayAverages('mood', 100, 101), [
    { day: 100, value: 3.5, count: 2 },
    { day: 101, value: 4, count: 1 }
  ]);
});

test('an entry without the metric contributes nothing, and neither does a day outside the range', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 99, mood: 1 });
  await journal.entries.upsertEntry({ epochDay: 100, mood: 3 });
  await journal.entries.upsertEntry({ epochDay: 101, note: 'no mood on this one' });
  await journal.entries.upsertEntry({ epochDay: 102, mood: 5 });
  await journal.entries.upsertEntry({ epochDay: 103, mood: 1 });

  // Both ends of the range are inclusive.
  assert.deepEqual(
    (await journal.stats.dayAverages('mood', 100, 102)).map((p) => p.day),
    [100, 102]
  );
});

test('a metric key nothing was ever logged against comes back empty rather than throwing', async () => {
  // The metric is a preference, and a dimension can be hidden after it was
  // chosen. A stats screen with nothing to draw is the right answer; an
  // exception on read is not.
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, mood: 3 });

  assert.deepEqual(await journal.stats.dayAverages('masculinity', 100, 100), []);
  assert.deepEqual(await journal.stats.dayAverages('no-such-dimension', 100, 100), []);
  assert.deepEqual(await journal.stats.tagInsights('no-such-dimension', 100, 100), []);
});

/* tag insights */

test('insights sort by the size of the difference, not its direction', async () => {
  const { journal } = await journalWithBuiltIns();
  // therapy: 5,5,5 against everything else. exercise: 4,4,4.
  for (const day of [100, 101, 102]) await journal.entries.upsertEntry({ epochDay: day, mood: 5, tags: ['a-therapy'] });
  for (const day of [103, 104, 105]) await journal.entries.upsertEntry({ epochDay: day, mood: 4, tags: ['a-exercise'] });
  for (const day of [106, 107, 108]) await journal.entries.upsertEntry({ epochDay: day, mood: 1, tags: ['e-sad'] });

  const rows = await journal.stats.tagInsights('mood', 100, 108);
  assert.deepEqual(
    rows.map((r) => r.id),
    ['e-sad', 'a-therapy', 'a-exercise']
  );
  assert.deepEqual(rows.map((r) => r.count), [3, 3, 3]);
  assert.equal(rows[0].withAvg, 1);
  assert.equal(rows[0].withoutAvg, 4.5);
});

/* An entry carrying two tags sits in one tag's "with" set and the other's,
   and in neither's "without" set. The averages are derived by subtracting
   each tag's total from the range's, so this is the case that says the
   subtraction is per tag and not a single split of the range. */
test('an entry carrying two tags counts towards both, and against neither comparison', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, mood: 5, tags: ['a-therapy', 'a-exercise'] });
  await journal.entries.upsertEntry({ epochDay: 101, mood: 5, tags: ['a-therapy'] });
  await journal.entries.upsertEntry({ epochDay: 102, mood: 3, tags: ['a-therapy'] });
  await journal.entries.upsertEntry({ epochDay: 103, mood: 1, tags: ['a-exercise'] });
  await journal.entries.upsertEntry({ epochDay: 104, mood: 1, tags: ['a-exercise'] });
  await journal.entries.upsertEntry({ epochDay: 105, mood: 2 });

  const rows = await journal.stats.tagInsights('mood', 100, 105);

  assert.deepEqual(
    rows.map((r) => ({ id: r.id, count: r.count, withAvg: r.withAvg, withoutAvg: r.withoutAvg })),
    [
      // 5,5,3 against the 1,1,2 that carry no therapy.
      { id: 'a-therapy', count: 3, withAvg: 13 / 3, withoutAvg: 4 / 3 },
      // 5,1,1 against the 5,3,2 that carry no exercise.
      { id: 'a-exercise', count: 3, withAvg: 7 / 3, withoutAvg: 10 / 3 }
    ]
  );
});

test('a tag with fewer than three valued entries in range is too noisy to report', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, mood: 5, tags: ['a-therapy'] });
  await journal.entries.upsertEntry({ epochDay: 101, mood: 5, tags: ['a-therapy'] });
  await journal.entries.upsertEntry({ epochDay: 102, mood: 1, tags: ['e-sad'] });
  await journal.entries.upsertEntry({ epochDay: 103, mood: 1, tags: ['e-sad'] });
  await journal.entries.upsertEntry({ epochDay: 104, mood: 1, tags: ['e-sad'] });
  await journal.entries.upsertEntry({ epochDay: 105, mood: 3 });

  assert.deepEqual((await journal.stats.tagInsights('mood', 100, 105)).map((r) => r.id), ['e-sad']);

  // A tagged entry with no mood on it does not count towards the three.
  await journal.entries.upsertEntry({ epochDay: 106, note: 'session', tags: ['a-therapy'] });
  assert.deepEqual((await journal.stats.tagInsights('mood', 100, 106)).map((r) => r.id), ['e-sad']);
});

test('a tag on every valued entry in range has nothing to compare against', async () => {
  const { journal } = await journalWithBuiltIns();
  for (const day of [100, 101, 102]) await journal.entries.upsertEntry({ epochDay: day, mood: 4, tags: ['e-calm'] });

  assert.deepEqual(await journal.stats.tagInsights('mood', 100, 102), []);
});

test('a hidden tag drops out of the insights, and comes back when it is unhidden', async () => {
  const { journal } = await journalWithBuiltIns();
  for (const day of [100, 101, 102]) await journal.entries.upsertEntry({ epochDay: day, mood: 5, tags: ['a-therapy'] });
  await journal.entries.upsertEntry({ epochDay: 103, mood: 1 });

  await journal.tags.setTagHidden('a-therapy', true);
  assert.deepEqual(await journal.stats.tagInsights('mood', 100, 103), []);

  await journal.tags.setTagHidden('a-therapy', false);
  assert.deepEqual((await journal.stats.tagInsights('mood', 100, 103)).map((r) => r.id), ['a-therapy']);
});

test('a custom tag is named by its uuid, the way a built-in is named by its key', async () => {
  const { journal } = await journalWithBuiltIns();
  const tag = await journal.tags.addTag('activities', 'voice practice');
  for (const day of [100, 101, 102]) await journal.entries.upsertEntry({ epochDay: day, mood: 5, tags: [tag.id] });
  await journal.entries.upsertEntry({ epochDay: 103, mood: 1 });

  assert.deepEqual((await journal.stats.tagInsights('mood', 100, 103)).map((r) => r.id), [tag.id]);
});

/* streak */

test('the streak is the run of days ending today, and today does not break it until today is over', async () => {
  const today = 20000;
  const { journal } = await journalWithBuiltIns();
  for (const day of [today - 3, today - 2, today - 1]) await journal.entries.upsertEntry({ epochDay: day, mood: 3 });

  // Nothing logged today yet: the run ending yesterday still stands.
  assert.equal(await journal.stats.streak(today), 3);

  await journal.entries.upsertEntry({ epochDay: today, mood: 4 });
  assert.equal(await journal.stats.streak(today), 4);
});

test('a backdated entry filling a gap repairs the streak', async () => {
  const today = 20000;
  const { journal } = await journalWithBuiltIns();
  for (const day of [today - 4, today - 3, today - 1, today]) {
    await journal.entries.upsertEntry({ epochDay: day, mood: 3 });
  }
  assert.equal(await journal.stats.streak(today), 2, 'the gap two days back stops the run');

  await journal.entries.upsertEntry({ epochDay: today - 2, mood: 2, note: 'written up a day late' });

  assert.equal(await journal.stats.streak(today), 5);
});

test('a run that ended before yesterday is not a streak, and no entries is no streak', async () => {
  const today = 20000;
  const { journal } = await journalWithBuiltIns();
  assert.equal(await journal.stats.streak(today), 0);

  for (const day of [today - 4, today - 3, today - 2]) await journal.entries.upsertEntry({ epochDay: day, mood: 3 });
  assert.equal(await journal.stats.streak(today), 0);
});

test('several entries on one day are one day of streak, and future entries do not extend it', async () => {
  const today = 20000;
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: today, timestamp: 1, mood: 3 });
  await journal.entries.upsertEntry({ epochDay: today, timestamp: 2, mood: 5 });
  await journal.entries.upsertEntry({ epochDay: today + 1, mood: 4 });
  await journal.entries.upsertEntry({ epochDay: today + 2, mood: 4 });

  assert.equal(await journal.stats.streak(today), 1);
});

/* recap */

test('a recap counts what the range held and never stores any of it', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, mood: 2, tags: ['e-tired', 'a-work'] });
  await journal.entries.upsertEntry({ epochDay: 101, mood: 4, tags: ['e-tired'] });
  await journal.entries.upsertEntry({ epochDay: 105, mood: 3, tags: ['a-work'] });
  await journal.entries.upsertEntry({ epochDay: 106, mood: 3, tags: ['e-tired'] });
  await journal.entries.upsertEntry({ epochDay: 107, mood: 3 });
  await journal.entries.upsertEntry({ epochDay: 130, mood: 1 }); // outside the range
  const reached = await journal.milestones.upsertMilestone({ epochDay: 104, name: '6 months on HRT' });
  await journal.milestones.upsertMilestone({ epochDay: 400, name: 'not yet' });

  const recap = await journal.stats.recap(100, 129);

  assert.equal(recap.entryCount, 5);
  assert.equal(recap.averageMood, 3);
  assert.equal(recap.bestStreak, 3, 'the longest run inside the range, not the run ending today');
  assert.deepEqual(recap.topTags, [
    { id: 'e-tired', count: 3 },
    { id: 'a-work', count: 2 }
  ]);
  assert.deepEqual(recap.milestones, [{ id: reached, name: '6 months on HRT', epochDay: 104 }]);
});

test('a recap of an empty month says so rather than dividing by zero', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 500, mood: 3 });

  assert.deepEqual(await journal.stats.recap(100, 129), {
    entryCount: 0,
    averageMood: null,
    bestStreak: 0,
    topTags: [],
    milestones: [],
    biggestDimensionChange: null
  });
});

test('the biggest dimension change is picked across ranges but reported in native units', async () => {
  const { journal } = await journalWithBuiltIns();
  const voice = await journal.dimensions.addCustomDimension({
    name: 'Voice comfort',
    low: 'strained',
    high: 'easy',
    min: 0,
    max: 10
  });
  // Euphoria moves 20 points of 100; voice moves 3 points of 10. The bigger
  // native number is the smaller move, which is what the normalized
  // comparison is for - and the answer still reads in native units.
  await journal.entries.upsertEntry({ epochDay: 100, dims: { euphoria_dysphoria: 40, [voice.key]: 2 } });
  await journal.entries.upsertEntry({ epochDay: 110, dims: { euphoria_dysphoria: 60, [voice.key]: 5 } });

  assert.deepEqual((await journal.stats.recap(100, 129)).biggestDimensionChange, {
    key: voice.key,
    from: 2,
    to: 5,
    change: 3
  });
});

test('a dimension logged once in the range has not changed', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, dims: { femininity: 40 } });

  assert.equal((await journal.stats.recap(100, 129)).biggestDimensionChange, null);
});

test('the change runs first to last within the range, by day and then by time of day', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 90, dims: { femininity: 10 } }); // before the range
  await journal.entries.upsertEntry({ epochDay: 100, timestamp: 20, dims: { femininity: 30 } });
  await journal.entries.upsertEntry({ epochDay: 100, timestamp: 10, dims: { femininity: 50 } });
  await journal.entries.upsertEntry({ epochDay: 110, dims: { femininity: 80 } });
  await journal.entries.upsertEntry({ epochDay: 200, dims: { femininity: 5 } }); // after it

  assert.deepEqual((await journal.stats.recap(100, 129)).biggestDimensionChange, {
    key: 'femininity',
    from: 50,
    to: 80,
    change: 30
  });
});

test('a hidden dimension is not the one a recap volunteers', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, dims: { masculinity: 10, femininity: 40 } });
  await journal.entries.upsertEntry({ epochDay: 110, dims: { masculinity: 90, femininity: 50 } });

  await journal.dimensions.setDimensionHidden('masculinity', true);

  assert.deepEqual((await journal.stats.recap(100, 129)).biggestDimensionChange, {
    key: 'femininity',
    from: 40,
    to: 50,
    change: 10
  });
});

/* Entries per day, which is not the same question as the metric's day
   average: the calendar shades a day by the metric but links it by whether
   anything was logged at all, so a day with entries that carry no mood is
   still a day with entries (ticket 08). */

test('entryCountsByDay counts every entry on a day, metric or no metric', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 99, mood: 3 }); // before the range
  await journal.entries.upsertEntry({ epochDay: 100, mood: 3 });
  await journal.entries.upsertEntry({ epochDay: 100, mood: 5 });
  await journal.entries.upsertEntry({ epochDay: 101, note: 'no mood on this one' });
  await journal.entries.upsertEntry({ epochDay: 131, mood: 1 }); // after it

  assert.deepEqual(await journal.stats.entryCountsByDay(100, 130), [
    { day: 100, count: 2 },
    { day: 101, count: 1 }
  ]);
});

test('entryCountsByDay over a range with nothing in it is empty', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, mood: 3 });
  assert.deepEqual(await journal.stats.entryCountsByDay(200, 230), []);
});
