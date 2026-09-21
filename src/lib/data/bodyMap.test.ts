/* The rule the body map paints by (phase 10 redesign ticket 40): a region's
   reading over a range is the side it mostly sits on, at the mean of that
   side alone. The other side is never subtracted, only not drawn. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { regionReading, regionSummary, type RegionSides } from './bodyMap.ts';

const sides = (over: Partial<RegionSides> = {}): RegionSides => ({
  region: 'chest',
  dysphoriaCount: 0,
  euphoriaCount: 0,
  dysphoriaMean: null,
  euphoriaMean: null,
  ...over
});

test('a region with no readings in the range is undrawn, not zero', () => {
  const reading = regionReading(sides());
  assert.equal(reading.side, null);
  assert.equal(reading.value, null);
  assert.equal(reading.mixed, false);
  assert.equal(reading.count, 0);
});

test('one side only: that side, at its own mean', () => {
  const dys = regionReading(sides({ dysphoriaCount: 3, dysphoriaMean: 60 }));
  assert.equal(dys.side, 'dysphoria');
  assert.equal(dys.value, 60);
  assert.equal(dys.mixed, false);
  assert.equal(dys.count, 3);

  const euph = regionReading(sides({ euphoriaCount: 2, euphoriaMean: 40 }));
  assert.equal(euph.side, 'euphoria');
  assert.equal(euph.value, 40);
  assert.equal(euph.mixed, false);
});

test('the majority side wins, and the minority is not subtracted from it', () => {
  // Four dysphoria readings averaging 70 and one euphoria at 90. A net
  // would drag this toward the midpoint; the mean of the winning side alone
  // is 70 and stays 70.
  const reading = regionReading(
    sides({ dysphoriaCount: 4, dysphoriaMean: 70, euphoriaCount: 1, euphoriaMean: 90 })
  );
  assert.equal(reading.side, 'dysphoria');
  assert.equal(reading.value, 70);
  assert.equal(reading.count, 5);
});

test('readings on both sides are marked mixed, whichever side wins', () => {
  assert.equal(
    regionReading(sides({ dysphoriaCount: 4, dysphoriaMean: 70, euphoriaCount: 1, euphoriaMean: 90 }))
      .mixed,
    true
  );
  assert.equal(
    regionReading(sides({ dysphoriaCount: 1, dysphoriaMean: 70, euphoriaCount: 6, euphoriaMean: 20 }))
      .mixed,
    true
  );
});

/* The binder day, which is the case this whole rule exists for: chest logged
   at dysphoria in the morning with a binder on and at euphoria in the
   evening with it off. One reading each way, so no side has the count. The
   louder of the two is painted and the day is marked mixed, so it neither
   averages out to "chest was fine" nor claims the quiet side never
   happened. */
test('an even split paints the louder side and is mixed', () => {
  const reading = regionReading(
    sides({ dysphoriaCount: 1, dysphoriaMean: 80, euphoriaCount: 1, euphoriaMean: 30 })
  );
  assert.equal(reading.side, 'dysphoria');
  assert.equal(reading.value, 80);
  assert.equal(reading.mixed, true);
  assert.equal(reading.count, 2);

  const other = regionReading(
    sides({ dysphoriaCount: 1, dysphoriaMean: 30, euphoriaCount: 1, euphoriaMean: 80 })
  );
  assert.equal(other.side, 'euphoria');
  assert.equal(other.value, 80);
  assert.equal(other.mixed, true);
});

/* Both counts and both means equal is the one case neither rule separates.
   It has to land somewhere deterministic rather than on whichever side the
   driver happened to hand back first. */
test('an exact tie on both count and intensity lands on dysphoria, deterministically', () => {
  const reading = regionReading(
    sides({ dysphoriaCount: 2, dysphoriaMean: 50, euphoriaCount: 2, euphoriaMean: 50 })
  );
  assert.equal(reading.side, 'dysphoria');
  assert.equal(reading.value, 50);
  assert.equal(reading.mixed, true);
});

/* What the words beside the figure say (phase 11 pre-production UI/UX
   ticket 30). The figure paints a region's reading and the sentence under it
   reads the same reading out, so both come off one answer rather than two
   near-identical guards - and "nothing here" has to survive a region the
   range never mentions, which is most of them on a quiet month. */

test('a region the range never mentions has nothing to say', () => {
  assert.deepEqual(regionSummary(undefined), { kind: 'none' });
});

test('a region present with no side is the same nothing', () => {
  assert.deepEqual(regionSummary(regionReading(sides())), { kind: 'none' });
});

test('a reading carries its side, its count and whether it went both ways', () => {
  const summary = regionSummary(
    regionReading(sides({ dysphoriaCount: 4, dysphoriaMean: 70, euphoriaCount: 1, euphoriaMean: 90 }))
  );
  assert.deepEqual(summary, { kind: 'reading', axis: 'dysphoria', value: 70, mixed: true, count: 5 });
});

/* The scale is native and whole (ADR-0012, ADR-0081): a mean of four
   readings is a fraction and nothing on this screen shows one. */
test('the mean is rounded to the scale a person reads', () => {
  const summary = regionSummary(regionReading(sides({ euphoriaCount: 3, euphoriaMean: 61.666_67 })));
  assert.deepEqual(summary, { kind: 'reading', axis: 'euphoria', value: 62, mixed: false, count: 3 });
});

test('a single reading is a reading, not a mean of many', () => {
  const summary = regionSummary(regionReading(sides({ dysphoriaCount: 1, dysphoriaMean: 20 })));
  assert.deepEqual(summary, { kind: 'reading', axis: 'dysphoria', value: 20, mixed: false, count: 1 });
});
