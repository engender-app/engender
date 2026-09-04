/* The stats area (ticket 10, ADR-0012). The case this module exists to
   settle is the first one: the demo store answered "what is this metric's
   average" with three different numbers depending on which function was
   asked, because two of them multiplied mood by 20 to fake a 0-100 range
   and one did not. Everything here is in native units. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { startOfDayTimestamp } from '../epochDay.ts';
import { journalWithBuiltIns } from './test-support.ts';

/* Photo bytes only have to be distinguishable here - normalize() is the
   browser's job and the journal stores what it is handed (ADR-0008). */
const shot = (full: string, thumb: string) => ({
  full: new Uint8Array([...full].map((c) => c.charCodeAt(0))),
  thumb: new Uint8Array([...thumb].map((c) => c.charCodeAt(0)))
});

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

test('a trashed entry is invisible everywhere in stats (phase 5 ticket 19)', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, mood: 4, tags: ['e-happy'] });
  const trashed = await journal.entries.upsertEntry({ epochDay: 101, mood: 5, tags: ['e-happy'] });

  await journal.entries.deleteEntry(trashed);

  assert.deepEqual(await journal.stats.dayAverages('mood', 100, 101), [{ day: 100, value: 4, count: 1 }]);
  assert.deepEqual(await journal.stats.entryCountsByDay(100, 101), [{ day: 100, count: 1 }]);
  assert.equal(await journal.stats.isGoodDay(101), false);

  const recap = await journal.stats.recap(100, 101);
  assert.equal(recap.entryCount, 1);
  assert.equal(recap.averageMood, 4);
  assert.deepEqual(recap.topTags, [{ id: 'e-happy', count: 1 }]);
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
  await journal.entries.upsertEntry({ epochDay: 100, mood: 3, dims: { femininity: 70, [voice.key]: 3 } });

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
  await journal.entries.upsertEntry({ epochDay: 99, mood: 1, dims: { femininity: 10 } });
  await journal.entries.upsertEntry({ epochDay: 100, mood: 3, dims: { femininity: 20 } });
  await journal.entries.upsertEntry({ epochDay: 101, mood: 2, note: 'no femininity value on this one' });
  await journal.entries.upsertEntry({ epochDay: 102, mood: 5, dims: { femininity: 30 } });
  await journal.entries.upsertEntry({ epochDay: 103, mood: 1, dims: { femininity: 40 } });

  // Both ends of the range are inclusive.
  assert.deepEqual(
    (await journal.stats.dayAverages('femininity', 100, 102)).map((p) => p.day),
    [100, 102]
  );
});

/* the day's spread (phase 6 unprompted ticket 11) */

test('a day reports the lowest and the highest of what was logged on it', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, timestamp: 1, mood: 2 });
  await journal.entries.upsertEntry({ epochDay: 100, timestamp: 2, mood: 5 });
  await journal.entries.upsertEntry({ epochDay: 100, timestamp: 3, mood: 3 });
  await journal.entries.upsertEntry({ epochDay: 101, mood: 4 });

  assert.deepEqual(await journal.stats.daySpread('mood', 100, 101), [
    { day: 100, low: 2, high: 5, first: 2, last: 3, count: 3 },
    // A single entry is its own everything. Whether that counts as a spread
    // is the screen's rule, not this read's.
    { day: 101, low: 4, high: 4, first: 4, last: 4, count: 1 }
  ]);
});

test('a day whose entries all said the same thing has no ground between its ends', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, timestamp: 1, mood: 3 });
  await journal.entries.upsertEntry({ epochDay: 100, timestamp: 2, mood: 3 });

  assert.deepEqual(await journal.stats.daySpread('mood', 100, 100), [
    { day: 100, low: 3, high: 3, first: 3, last: 3, count: 2 }
  ]);
});

test('the spread is in the metric\'s own units, whatever range those are on', async () => {
  const { journal } = await journalWithBuiltIns();
  const voice = await journal.dimensions.addCustomDimension({
    name: 'Voice comfort',
    low: 'strained',
    high: 'easy',
    min: 0,
    max: 10
  });
  await journal.entries.upsertEntry({ epochDay: 100, timestamp: 1, mood: 3, dims: { femininity: 20, [voice.key]: 3 } });
  await journal.entries.upsertEntry({ epochDay: 100, timestamp: 2, mood: 4, dims: { femininity: 85, [voice.key]: 8 } });

  assert.deepEqual(await journal.stats.daySpread('femininity', 100, 100), [
    { day: 100, low: 20, high: 85, first: 20, last: 85, count: 2 }
  ]);
  assert.deepEqual(await journal.stats.daySpread(voice.key, 100, 100), [
    { day: 100, low: 3, high: 8, first: 3, last: 8, count: 2 }
  ]);
});

test('the spread agrees with the average about which days and which entries counted', async () => {
  /* The calendar draws both on one cell, so a day the average knows about
     and the spread does not - a trashed entry counted by one and not the
     other, a day one of them rounds into the range - is a cell contradicting
     itself. */
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 99, mood: 1 });
  await journal.entries.upsertEntry({ epochDay: 100, timestamp: 1, mood: 1 });
  await journal.entries.upsertEntry({ epochDay: 100, timestamp: 2, mood: 5 });
  await journal.entries.upsertEntry({ epochDay: 101, mood: 2, note: 'no mood?' });
  const trashed = await journal.entries.upsertEntry({ epochDay: 102, timestamp: 1, mood: 5 });
  await journal.entries.upsertEntry({ epochDay: 102, timestamp: 2, mood: 3 });
  await journal.entries.upsertEntry({ epochDay: 104, mood: 4 });
  await journal.entries.deleteEntry(trashed);

  const averages = await journal.stats.dayAverages('mood', 100, 103);
  const spreads = await journal.stats.daySpread('mood', 100, 103);
  assert.deepEqual(spreads.map((s) => s.day), averages.map((a) => a.day));
  assert.deepEqual(spreads.map((s) => s.count), averages.map((a) => a.count));
  // The trashed 5 is gone from both ends, not just from the average.
  assert.deepEqual(spreads, [
    { day: 100, low: 1, high: 5, first: 1, last: 5, count: 2 },
    { day: 101, low: 2, high: 2, first: 2, last: 2, count: 1 },
    // The trashed 5 was this day's first entry, so it is gone from `first`
    // as well as from the ends.
    { day: 102, low: 3, high: 3, first: 3, last: 3, count: 1 }
  ]);
});

test('a day reports its earliest and latest reading, which is not its lowest and highest', async () => {
  /* The calendar splits a two-reading day chronologically (Alicja,
     2026-09-02), so the read has to answer "which came first" separately
     from "which was smaller" - and a day that went from good to bad is
     exactly where the two answers come apart. */
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, timestamp: startOfDayTimestamp(100) + 3600000, mood: 5 });
  await journal.entries.upsertEntry({ epochDay: 100, timestamp: startOfDayTimestamp(100) + 7200000, mood: 2 });
  // Logged out of order, so a read that trusted insertion order would fail.
  await journal.entries.upsertEntry({ epochDay: 101, timestamp: startOfDayTimestamp(101) + 7200000, mood: 4 });
  await journal.entries.upsertEntry({ epochDay: 101, timestamp: startOfDayTimestamp(101) + 3600000, mood: 1 });

  assert.deepEqual(await journal.stats.daySpread('mood', 100, 101), [
    { day: 100, low: 2, high: 5, first: 5, last: 2, count: 2 },
    { day: 101, low: 1, high: 4, first: 1, last: 4, count: 2 }
  ]);
});

test('three readings report the ends of the day, not the ends of the scale', async () => {
  // Past two entries the earliest and latest are not the smallest and
  // largest at all, and both pairs have a reader.
  const { journal } = await journalWithBuiltIns();
  for (const [hour, mood] of [[8, 3], [13, 5], [20, 1]] as const) {
    await journal.entries.upsertEntry({
      epochDay: 100,
      timestamp: startOfDayTimestamp(100) + hour * 3600000,
      mood
    });
  }
  assert.deepEqual(await journal.stats.daySpread('mood', 100, 100), [
    { day: 100, low: 1, high: 5, first: 3, last: 1, count: 3 }
  ]);
});

test('a metric nothing was logged against has no spread rather than an error', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, mood: 3 });
  assert.deepEqual(await journal.stats.daySpread('masculinity', 100, 100), []);
  assert.deepEqual(await journal.stats.daySpread('no-such-dimension', 100, 100), []);
});

/* body region trend (ticket 09) */

test('a body-region trend reports per-day averages the same way dayAverages does', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, timestamp: 1, mood: 3, bodyRegions: { chest: { dysphoria: 20, euphoria: null } } });
  await journal.entries.upsertEntry({ epochDay: 100, timestamp: 2, mood: 3, bodyRegions: { chest: { dysphoria: 40, euphoria: null } } });
  await journal.entries.upsertEntry({ epochDay: 101, mood: 3, bodyRegions: { chest: { dysphoria: 60, euphoria: null }, hairline: { dysphoria: 10, euphoria: null } } });
  await journal.entries.upsertEntry({ epochDay: 102, mood: 3 }); // no body regions at all

  assert.deepEqual(await journal.stats.bodyRegionTrend('chest', 'dysphoria', 100, 102), [
    { day: 100, value: 30, count: 2 },
    { day: 101, value: 60, count: 1 }
  ]);
  assert.deepEqual(await journal.stats.bodyRegionTrend('hairline', 'dysphoria', 100, 102), [
    { day: 101, value: 10, count: 1 }
  ]);
});

test('the two axes of a region trend independently, and an unlogged axis is absent rather than zero', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({
    epochDay: 100,
    mood: 3,
    bodyRegions: { chest: { dysphoria: 80, euphoria: null } }
  });
  await journal.entries.upsertEntry({
    epochDay: 101,
    mood: 3,
    bodyRegions: { chest: { dysphoria: null, euphoria: 60 } }
  });
  await journal.entries.upsertEntry({
    epochDay: 102,
    mood: 3,
    bodyRegions: { chest: { dysphoria: 20, euphoria: 40 } }
  });

  // Day 101 said nothing about dysphoria, so it is missing from that series
  // rather than dragging it towards 0 - and the same for euphoria on 100.
  assert.deepEqual(await journal.stats.bodyRegionTrend('chest', 'dysphoria', 100, 102), [
    { day: 100, value: 80, count: 1 },
    { day: 102, value: 20, count: 1 }
  ]);
  assert.deepEqual(await journal.stats.bodyRegionTrend('chest', 'euphoria', 100, 102), [
    { day: 101, value: 60, count: 1 },
    { day: 102, value: 40, count: 1 }
  ]);
});

test('a region nothing was ever logged against comes back empty rather than throwing', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, mood: 3, bodyRegions: { chest: { dysphoria: 50, euphoria: null } } });

  assert.deepEqual(await journal.stats.bodyRegionTrend('genitals', 'dysphoria', 100, 100), []);
});

test('a body-region trend filters by presentation, and partitions the unfiltered view (ADR-0048, ticket 18)', async () => {
  const { journal } = await journalWithBuiltIns();
  const girl = await journal.presentations.addPresentation('Girl mode', 0);
  const boy = await journal.presentations.addPresentation('Boy mode', 1);

  await journal.entries.upsertEntry({
    epochDay: 100,
    mood: 3,
    presentationId: girl.id,
    bodyRegions: { chest: { dysphoria: 20, euphoria: null } }
  });
  await journal.entries.upsertEntry({
    epochDay: 101,
    mood: 3,
    presentationId: boy.id,
    bodyRegions: { chest: { dysphoria: 80, euphoria: null } }
  });
  await journal.entries.upsertEntry({
    epochDay: 102,
    mood: 3,
    bodyRegions: { chest: { dysphoria: 50, euphoria: null } }
  });

  assert.deepEqual(await journal.stats.bodyRegionTrend('chest', 'dysphoria', 100, 102, girl.id), [
    { day: 100, value: 20, count: 1 }
  ]);
  assert.deepEqual(await journal.stats.bodyRegionTrend('chest', 'dysphoria', 100, 102, null), [
    { day: 102, value: 50, count: 1 }
  ]);

  const [unfiltered, byGirl, byBoy, byNone] = await Promise.all([
    journal.stats.bodyRegionTrend('chest', 'dysphoria', 100, 102),
    journal.stats.bodyRegionTrend('chest', 'dysphoria', 100, 102, girl.id),
    journal.stats.bodyRegionTrend('chest', 'dysphoria', 100, 102, boy.id),
    journal.stats.bodyRegionTrend('chest', 'dysphoria', 100, 102, null)
  ]);
  const totalCount = (rows: { count: number }[]) => rows.reduce((sum, r) => sum + r.count, 0);
  assert.equal(totalCount(byGirl) + totalCount(byBoy) + totalCount(byNone), totalCount(unfiltered));
});

/* wear-time trend (phase 5 ticket 04) */

test('a wear-time trend averages completed sessions per day, in hours', async () => {
  const { journal } = await journalWithBuiltIns();

  await journal.wearSessions.upsertSession({ startTimestamp: startOfDayTimestamp(100) + 9 * 3600000, durationMs: 4 * 3600000 });
  await journal.wearSessions.upsertSession({ startTimestamp: startOfDayTimestamp(100) + 15 * 3600000, durationMs: 2 * 3600000 });
  await journal.wearSessions.upsertSession({ startTimestamp: startOfDayTimestamp(101) + 9 * 3600000, durationMs: 6 * 3600000 });

  assert.deepEqual(await journal.stats.wearTimeTrend(100, 101), [
    { day: 100, value: 3, count: 2 },
    { day: 101, value: 6, count: 1 }
  ]);
});

test('a still-running session has no duration to average and is left out of the trend', async () => {
  const { journal } = await journalWithBuiltIns();

  await journal.wearSessions.upsertSession({ startTimestamp: startOfDayTimestamp(100) + 9 * 3600000, durationMs: null });

  assert.deepEqual(await journal.stats.wearTimeTrend(100, 100), []);
});

test('a range with no completed session comes back empty rather than throwing', async () => {
  const { journal } = await journalWithBuiltIns();
  assert.deepEqual(await journal.stats.wearTimeTrend(100, 100), []);
});

/* tally trend (ticket 10) */

test('a tally trend counts taps per day, the two kinds kept apart', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.tally.log({ epochDay: 100, kind: 'misgendered' });
  await journal.tally.log({ epochDay: 100, kind: 'misgendered' });
  await journal.tally.log({ epochDay: 101, kind: 'misgendered' });
  await journal.tally.log({ epochDay: 100, kind: 'correctly_gendered' });
  await journal.tally.log({ epochDay: 102, kind: 'misgendered' }); // outside the queried range

  assert.deepEqual(await journal.stats.tallyTrend('misgendered', 100, 101), [
    { day: 100, value: 2, count: 2 },
    { day: 101, value: 1, count: 1 }
  ]);
  assert.deepEqual(await journal.stats.tallyTrend('correctly_gendered', 100, 101), [{ day: 100, value: 1, count: 1 }]);
});

test('a kind with no events in range comes back empty rather than throwing', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.tally.log({ epochDay: 100, kind: 'misgendered' });

  assert.deepEqual(await journal.stats.tallyTrend('correctly_gendered', 100, 100), []);
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
  await journal.entries.upsertEntry({ epochDay: 100, mood: 3, dims: { femininity: 90 }, tags: ['a-therapy'] });
  await journal.entries.upsertEntry({ epochDay: 101, mood: 3, dims: { femininity: 90 }, tags: ['a-therapy'] });
  await journal.entries.upsertEntry({ epochDay: 102, mood: 3, dims: { femininity: 10 }, tags: ['e-sad'] });
  await journal.entries.upsertEntry({ epochDay: 103, mood: 3, dims: { femininity: 10 }, tags: ['e-sad'] });
  await journal.entries.upsertEntry({ epochDay: 104, mood: 3, dims: { femininity: 10 }, tags: ['e-sad'] });
  await journal.entries.upsertEntry({ epochDay: 105, mood: 3, dims: { femininity: 50 } });

  assert.deepEqual((await journal.stats.tagInsights('femininity', 100, 105)).map((r) => r.id), ['e-sad']);

  // A tagged entry with no femininity value does not count towards the three.
  await journal.entries.upsertEntry({ epochDay: 106, mood: 3, note: 'session', tags: ['a-therapy'] });
  assert.deepEqual((await journal.stats.tagInsights('femininity', 100, 106)).map((r) => r.id), ['e-sad']);
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
    topTags: [],
    milestones: [],
    biggestDimensionChange: null,
    photoHighlights: []
  });
});

/* Photo highlights (phase 4 features ticket 01). A wrapped shows pictures
   from the period it covers, and it reads them off this seam like every
   other number in it - so there is still one range, one recomputation, and
   nothing stored. */

test('photo highlights are spread across the range rather than taken from its first days', async () => {
  const { journal } = await journalWithBuiltIns();
  for (let offset = 0; offset < 8; offset++) {
    const entryId = await journal.entries.upsertEntry({ epochDay: 100 + offset, mood: 3 });
    await journal.photos.attach({ entryId }, shot(`full-${offset}`, `thumb-${offset}`));
  }

  const { photoHighlights } = await journal.stats.recap(100, 129);

  /* Four out of eight, one from each quarter of the period's photos. Taking
     the oldest four instead would answer "what did this year look like" with
     January, which is the failure this spread exists to avoid. */
  assert.deepEqual(
    photoHighlights.map((p) => p.epochDay),
    [100, 102, 104, 106]
  );
});

test('a range with fewer photos than the highlight count keeps all of them, oldest first', async () => {
  const { journal } = await journalWithBuiltIns();
  const later = await journal.entries.upsertEntry({ epochDay: 120, mood: 3 });
  const earlier = await journal.entries.upsertEntry({ epochDay: 105, mood: 3 });
  const second = await journal.photos.attach({ entryId: later }, shot('b', 'B'));
  const first = await journal.photos.attach({ entryId: earlier }, shot('a', 'A'));

  const { photoHighlights } = await journal.stats.recap(100, 129);

  assert.deepEqual(photoHighlights, [
    { id: first, fileName: `${first}.jpg`, starred: false, epochDay: 105 },
    { id: second, fileName: `${second}.jpg`, starred: false, epochDay: 120 }
  ]);
});

/* "Oldest first" has to decide two photos taken the same day too, and the
   answer is the order they were attached in - the same order the entry
   editor shows them in - rather than whatever their uuids sort to. */
test('two highlights from one day keep the order the photos were attached in', async () => {
  const { journal } = await journalWithBuiltIns();
  const entryId = await journal.entries.upsertEntry({ epochDay: 110, mood: 3 });
  const first = await journal.photos.attach({ entryId }, shot('a', 'A'));
  const second = await journal.photos.attach({ entryId }, shot('b', 'B'));

  const { photoHighlights } = await journal.stats.recap(100, 129);

  assert.deepEqual(
    photoHighlights.map((p) => p.id),
    [first, second]
  );
});

test("a milestone's photo is a highlight too, and a photo outside the range is not", async () => {
  const { journal } = await journalWithBuiltIns();
  const inside = await journal.milestones.upsertMilestone({ epochDay: 110, name: 'HRT start' });
  const milestonePhoto = await journal.photos.attach({ milestoneId: inside }, shot('m', 'M'));
  const outside = await journal.entries.upsertEntry({ epochDay: 200, mood: 3 });
  await journal.photos.attach({ entryId: outside }, shot('x', 'X'));

  const { photoHighlights } = await journal.stats.recap(100, 129);

  assert.deepEqual(photoHighlights, [
    { id: milestonePhoto, fileName: `${milestonePhoto}.jpg`, starred: false, epochDay: 110 }
  ]);
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
  await journal.entries.upsertEntry({ epochDay: 100, mood: 3, dims: { euphoria_dysphoria: 40, [voice.key]: 2 } });
  await journal.entries.upsertEntry({ epochDay: 110, mood: 3, dims: { euphoria_dysphoria: 60, [voice.key]: 5 } });

  assert.deepEqual((await journal.stats.recap(100, 129)).biggestDimensionChange, {
    key: voice.key,
    from: 2,
    to: 5,
    change: 3
  });
});

test('a dimension logged once in the range has not changed', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, mood: 3, dims: { femininity: 40 } });

  assert.equal((await journal.stats.recap(100, 129)).biggestDimensionChange, null);
});

test('the change runs first to last within the range, by day and then by time of day', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 90, mood: 3, dims: { femininity: 10 } }); // before the range
  await journal.entries.upsertEntry({ epochDay: 100, mood: 3, timestamp: 20, dims: { femininity: 30 } });
  await journal.entries.upsertEntry({ epochDay: 100, mood: 3, timestamp: 10, dims: { femininity: 50 } });
  await journal.entries.upsertEntry({ epochDay: 110, mood: 3, dims: { femininity: 80 } });
  await journal.entries.upsertEntry({ epochDay: 200, mood: 3, dims: { femininity: 5 } }); // after it

  assert.deepEqual((await journal.stats.recap(100, 129)).biggestDimensionChange, {
    key: 'femininity',
    from: 50,
    to: 80,
    change: 30
  });
});

test('a hidden dimension is not the one a recap volunteers', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, mood: 3, dims: { masculinity: 10, femininity: 40 } });
  await journal.entries.upsertEntry({ epochDay: 110, mood: 3, dims: { masculinity: 90, femininity: 50 } });

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
   anything was logged at all, so a day with entries that carry no value for
   the metric charted is still a day with entries (ticket 08). */

test('entryCountsByDay counts every entry on a day, metric or no metric', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 99, mood: 3 }); // before the range
  await journal.entries.upsertEntry({ epochDay: 100, mood: 3 });
  await journal.entries.upsertEntry({ epochDay: 100, mood: 5 });
  await journal.entries.upsertEntry({ epochDay: 101, mood: 2, note: 'no dimension value on this one' });
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

/* On-this-day's good-day rule (ticket 03, CONTEXT: Good day): a day average
   mood at or above the mood scale's midpoint, a euphoria capture, or
   either - and nothing else ever qualifies a day. */

test('a day averaging at or above the mood midpoint is a good day', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, mood: 3 });
  await journal.entries.upsertEntry({ epochDay: 101, mood: 2 });

  assert.equal(await journal.stats.isGoodDay(100), true);
  assert.equal(await journal.stats.isGoodDay(101), false);
});

test('a euphoria capture makes a day good regardless of its mood', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, mood: 1, tags: ['g-euphoria'] });

  assert.equal(await journal.stats.isGoodDay(100), true);
});

test('a day averaging below the midpoint with no euphoria capture is not a good day', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, mood: 2, tags: ['dt-social'] });

  assert.equal(await journal.stats.isGoodDay(100), false);
});

test('a trashed entry\'s body-region euphoria does not make a day good', async () => {
  const { journal } = await journalWithBuiltIns();
  const trashed = await journal.entries.upsertEntry({
    epochDay: 100,
    mood: 1,
    bodyRegions: { chest: { dysphoria: null, euphoria: 90 } }
  });
  await journal.entries.deleteEntry(trashed);

  assert.equal(await journal.stats.isGoodDay(100), false);
});

test('a body region logged with high euphoria makes a day good, with no euphoria tag at all', async () => {
  // The case ticket 44 was found by: someone whose good day shows up as a
  // high euphoria on a body region and never a tag.
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({
    epochDay: 100,
    mood: 1,
    bodyRegions: { chest: { dysphoria: null, euphoria: 70 } }
  });

  assert.equal(await journal.stats.isGoodDay(100), true);
});

test('the region-euphoria floor is inclusive: exactly 50 clears it, 49 does not', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({
    epochDay: 100,
    mood: 1,
    bodyRegions: { chest: { dysphoria: null, euphoria: 50 } }
  });
  await journal.entries.upsertEntry({
    epochDay: 101,
    mood: 1,
    bodyRegions: { chest: { dysphoria: null, euphoria: 49 } }
  });

  assert.equal(await journal.stats.isGoodDay(100), true);
  assert.equal(await journal.stats.isGoodDay(101), false);
});

test('a region logged as high dysphoria does not make a day good', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({
    epochDay: 100,
    mood: 1,
    bodyRegions: { chest: { dysphoria: 90, euphoria: null } }
  });

  assert.equal(await journal.stats.isGoodDay(100), false);
});

test('a low euphoria on one region and a low euphoria on another do not average up to the floor', async () => {
  // The reason the region clause is EXISTS and not AVG: a region's values
  // are a vector per entry, so two regions at 30 must not read as one
  // region at 60.
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({
    epochDay: 100,
    mood: 1,
    bodyRegions: {
      chest: { dysphoria: null, euphoria: 30 },
      hairline: { dysphoria: null, euphoria: 30 }
    }
  });

  assert.equal(await journal.stats.isGoodDay(100), false);
});

test('a euphoria capture on one of several entries is enough, even with a low day average', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, timestamp: 1, mood: 1 });
  await journal.entries.upsertEntry({ epochDay: 100, timestamp: 2, mood: 1, tags: ['g-euphoria'] });

  assert.equal(await journal.stats.isGoodDay(100), true);
});

// The case ticket 32 was found by: someone whose euphoria is entirely
// social or body-specific tags g-soc-eu/g-body-eu faithfully for months
// and the general g-euphoria tag never once. Neither is the general tag,
// so the bar must clear on either alone.
test('a social euphoria capture makes a day good, with no g-euphoria tag at all', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, mood: 1, tags: ['g-soc-eu'] });

  assert.equal(await journal.stats.isGoodDay(100), true);
});

test('a body euphoria capture makes a day good, with no g-euphoria tag at all', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, mood: 1, tags: ['g-body-eu'] });

  assert.equal(await journal.stats.isGoodDay(100), true);
});

test('a day with nothing logged on it is not a good day', async () => {
  const { journal } = await journalWithBuiltIns();
  assert.equal(await journal.stats.isGoodDay(100), false);
});

test('the constellation reads one row per entry that carries both scales (ticket 19)', async () => {
  const { journal } = await journalWithBuiltIns();
  const girl = await journal.presentations.addPresentation('Girl mode', 0);

  // Both scales, with a presentation.
  await journal.entries.upsertEntry({
    epochDay: 100,
    timestamp: 1,
    mood: 3,
    dims: { femininity: 70, masculinity: 20 },
    presentationId: girl.id
  });
  // Both scales, with none - a resting state, and still a point.
  await journal.entries.upsertEntry({
    epochDay: 101,
    timestamp: 2,
    mood: 3,
    dims: { femininity: 40, masculinity: 60 }
  });
  // One scale only: no position on a plane, so no row.
  await journal.entries.upsertEntry({ epochDay: 102, timestamp: 3, mood: 3, dims: { femininity: 90 } });

  const readings = await journal.stats.constellationReadings('femininity', 'masculinity', 100, 102);
  assert.deepEqual(
    readings.map((r) => ({ day: r.day, x: r.x, y: r.y, presentationId: r.presentationId })),
    [
      { day: 100, x: 70, y: 20, presentationId: girl.id },
      { day: 101, x: 40, y: 60, presentationId: null }
    ]
  );
});

test('two entries on one day are two constellation points, never their average', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, timestamp: 1, mood: 3, dims: { femininity: 0, masculinity: 100 } });
  await journal.entries.upsertEntry({ epochDay: 100, timestamp: 2, mood: 3, dims: { femininity: 100, masculinity: 0 } });

  const readings = await journal.stats.constellationReadings('femininity', 'masculinity', 100, 100);
  assert.deepEqual(readings.map((r) => r.x), [0, 100]);
});

test('a trashed entry leaves the constellation, and the range holds both ends', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 99, mood: 3, dims: { femininity: 10, masculinity: 10 } });
  await journal.entries.upsertEntry({ epochDay: 100, mood: 3, dims: { femininity: 20, masculinity: 20 } });
  const gone = await journal.entries.upsertEntry({ epochDay: 101, mood: 3, dims: { femininity: 30, masculinity: 30 } });
  await journal.entries.upsertEntry({ epochDay: 102, mood: 3, dims: { femininity: 40, masculinity: 40 } });

  await journal.entries.deleteEntry(gone);

  const readings = await journal.stats.constellationReadings('femininity', 'masculinity', 100, 102);
  assert.deepEqual(readings.map((r) => r.day), [100, 102]);
});

// A scale nobody has - a custom one hidden since, or an archive from a build
// that knew a key this one does not - reads as an empty chart rather than an
// error, the same answer dayAverages gives.
test('a constellation axis naming no scale plots nothing', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, mood: 3, dims: { femininity: 50, masculinity: 50 } });

  assert.deepEqual(await journal.stats.constellationReadings('femininity', 'nope', 100, 100), []);
});

test('presentationDays names the distinct days a presentation was logged under, and only those (ticket 17, ADR-0048)', async () => {
  const { journal } = await journalWithBuiltIns();
  const girl = await journal.presentations.addPresentation('Girl mode', 0);
  const boy = await journal.presentations.addPresentation('Boy mode', 1);

  await journal.entries.upsertEntry({ epochDay: 100, timestamp: 1, mood: 3, presentationId: girl.id });
  // A second entry on a day already counted does not repeat the day.
  await journal.entries.upsertEntry({ epochDay: 100, timestamp: 2, mood: 3, presentationId: girl.id });
  await journal.entries.upsertEntry({ epochDay: 101, mood: 3, presentationId: boy.id });
  await journal.entries.upsertEntry({ epochDay: 102, mood: 3 });

  assert.deepEqual(await journal.stats.presentationDays(girl.id, 100, 102), [100]);
  assert.deepEqual(await journal.stats.presentationDays(boy.id, 100, 102), [101]);
});

test('presentationDays holds the range and drops a trashed entry', async () => {
  const { journal } = await journalWithBuiltIns();
  const girl = await journal.presentations.addPresentation('Girl mode', 0);

  await journal.entries.upsertEntry({ epochDay: 99, mood: 3, presentationId: girl.id });
  await journal.entries.upsertEntry({ epochDay: 100, mood: 3, presentationId: girl.id });
  const gone = await journal.entries.upsertEntry({ epochDay: 101, mood: 3, presentationId: girl.id });
  await journal.entries.deleteEntry(gone);

  assert.deepEqual(await journal.stats.presentationDays(girl.id, 100, 101), [100]);
});

test('a presentation with no days in the range answers with none, not an error', async () => {
  const { journal } = await journalWithBuiltIns();
  const girl = await journal.presentations.addPresentation('Girl mode', 0);
  await journal.entries.upsertEntry({ epochDay: 100, mood: 3 });

  assert.deepEqual(await journal.stats.presentationDays(girl.id, 100, 100), []);
});

test('tagShare counts every tag, uncapped, so a ring can be a ring of the whole (phase 8 UX ticket 03)', async () => {
  const { journal } = await journalWithBuiltIns();
  /* Four distinct tags, so the recap's own LIMIT 3 would drop one. That drop
     is the whole reason this read exists: a parts-of-a-whole form computes
     each share against the sum of what it is handed, so a top three drawn as
     a full circle inflates every share and can never show the remainder
     ADR-0058 requires. */
  await journal.entries.upsertEntry({ epochDay: 100, mood: 3, tags: ['e-tired', 'e-happy'] });
  await journal.entries.upsertEntry({ epochDay: 101, mood: 3, tags: ['e-tired', 'e-calm'] });
  await journal.entries.upsertEntry({ epochDay: 102, mood: 3, tags: ['e-tired'] });
  await journal.entries.upsertEntry({ epochDay: 103, mood: 3, tags: ['e-happy', 'e-sad'] });

  const share = await journal.stats.tagShare(100, 103);
  assert.deepEqual(share, [
    { id: 'e-tired', count: 3 },
    { id: 'e-sad', count: 1 },
    { id: 'e-happy', count: 2 },
    { id: 'e-calm', count: 1 }
  ].sort((a, b) => b.count - a.count || (a.id < b.id ? -1 : 1)));

  // The recap the ring used to read stops at three, which is the bug.
  assert.equal((await journal.stats.recap(100, 103)).topTags.length, 3);
  assert.equal(share.length, 4);

  // An entry carrying two tags counts once under each, so the whole is tag
  // uses rather than entries - which is what a share by tag is a share of.
  assert.equal(share.reduce((sum, t) => sum + t.count, 0), 7);
});

test('tagShare leaves a hidden tag out and a trashed entry uncounted', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, mood: 3, tags: ['e-tired', 'e-happy'] });
  const trashed = await journal.entries.upsertEntry({ epochDay: 101, mood: 3, tags: ['e-tired'] });
  await journal.entries.deleteEntry(trashed);
  await journal.tags.setTagHidden('e-happy', true);

  assert.deepEqual(await journal.stats.tagShare(100, 101), [{ id: 'e-tired', count: 1 }]);
});

test('tagShare is bounded by its range at both ends', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 99, mood: 3, tags: ['e-tired'] });
  await journal.entries.upsertEntry({ epochDay: 100, mood: 3, tags: ['e-tired'] });
  await journal.entries.upsertEntry({ epochDay: 101, mood: 3, tags: ['e-tired'] });
  await journal.entries.upsertEntry({ epochDay: 102, mood: 3, tags: ['e-tired'] });

  assert.deepEqual(await journal.stats.tagShare(100, 101), [{ id: 'e-tired', count: 2 }]);
});
