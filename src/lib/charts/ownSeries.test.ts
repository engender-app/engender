import assert from 'node:assert/strict';
import { test } from 'vitest';
import { captureChainOf } from '../audio/captureChain.ts';
import { OWN_SERIES_METRICS } from '../data/voice/metrics.ts';
import { ownSeries, type BenchmarkForSeries } from './ownSeries.ts';

const UNPROCESSED = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
const PIXEL = captureChainOf('Pixel 10a', 'Bottom microphone', UNPROCESSED);
const SAMSUNG = captureChainOf('SM-A546B', 'Bottom microphone', UNPROCESSED);
const PIXEL_PROCESSED = captureChainOf('Pixel 10a', 'Bottom microphone', {
  ...UNPROCESSED,
  noiseSuppression: true
});

/** A benchmark with every figure measured, at a day and on a chain. The
    figures move with the day so a run's own order is readable in the
    assertions. */
function take(epochDay: number, chain: string | null, over: Partial<BenchmarkForSeries> = {}): BenchmarkForSeries {
  return {
    epochDay,
    passageKey: 'rainbow',
    captureChain: chain,
    f0P10Hz: 120 + epochDay,
    f0P90Hz: 200 + epochDay,
    semitoneSd: 2 + epochDay / 100,
    wordsPerMinute: 140 + epochDay,
    f1Hz: 600 + epochDay,
    f2Hz: 1400 + epochDay,
    snrDb: 20 + epochDay / 10,
    resonanceScale: 0.9 + epochDay / 100,
    ...over
  };
}

test('one chain and one passage is one run, oldest first, in the units the figure was measured in', () => {
  const series = ownSeries([take(1, PIXEL), take(2, PIXEL), take(3, PIXEL)], 'rate');
  assert.equal(series.runs.length, 1);
  assert.deepEqual(series.breaks, []);
  assert.deepEqual(
    series.runs[0].points,
    [
      { x: 1, y: 141 },
      { x: 2, y: 142 },
      { x: 3, y: 143 }
    ]
  );
  assert.equal(series.readings, 3);
  assert.equal(series.runs[0].second, null);
});

test('the scale is padded off the readings rather than starting at zero', () => {
  const series = ownSeries([take(1, PIXEL), take(3, PIXEL)], 'rate');
  // 141 to 143, a fifth of the spread on each side.
  assert.ok(Math.abs(series.scale!.min - 140.6) < 1e-9, String(series.scale?.min));
  assert.ok(Math.abs(series.scale!.max - 143.4) < 1e-9, String(series.scale?.max));
  assert.equal(series.secondScale, null);
});

test('a flat run still has a scale to draw against', () => {
  const flat = [take(1, PIXEL, { wordsPerMinute: 150 }), take(2, PIXEL, { wordsPerMinute: 150 })];
  const series = ownSeries(flat, 'rate');
  assert.ok(series.scale && series.scale.min < 150 && series.scale.max > 150);
});

test('a different phone breaks the series and names the phone as the reason', () => {
  const series = ownSeries([take(1, PIXEL), take(2, PIXEL), take(3, SAMSUNG)], 'resonance');
  assert.deepEqual(series.breaks, ['device']);
  assert.deepEqual(
    series.runs.map((run) => run.points.map((point) => point.x)),
    [[1, 2], [3]]
  );
});

test('the same phone that stopped granting unprocessed capture breaks it too', () => {
  const series = ownSeries([take(1, PIXEL), take(2, PIXEL_PROCESSED)], 'resonance');
  assert.deepEqual(series.breaks, ['processing']);
  assert.equal(series.runs.length, 2);
});

test('a chain nothing recorded breaks the series without naming equipment', () => {
  const series = ownSeries([take(1, null), take(2, null)], 'room');
  assert.deepEqual(series.breaks, ['unrecorded']);
  assert.equal(series.runs.length, 2);
});

/* CONTEXT: "Capture chain" - changing phone breaks a series the way
   changing the passage does, and the passage is the wider break: two
   passages leave nothing to compare at all. */
test('a different passage breaks the series, and says so even when the phone changed as well', () => {
  const own = ownSeries([take(1, PIXEL), take(2, PIXEL, { passageKey: 'polnocny-wiatr' })], 'rate');
  assert.deepEqual(own.breaks, ['passage']);

  const both = ownSeries([take(1, PIXEL), take(2, SAMSUNG, { passageKey: 'polnocny-wiatr' })], 'rate');
  assert.deepEqual(both.breaks, ['passage']);
});

test('every break in a long history is named in order', () => {
  const series = ownSeries(
    [take(1, PIXEL), take(2, SAMSUNG), take(3, SAMSUNG), take(4, null), take(5, null, { passageKey: 'other' })],
    'rate'
  );
  assert.deepEqual(series.breaks, ['device', 'unrecorded', 'passage']);
  assert.deepEqual(
    series.runs.map((run) => run.points.length),
    [1, 2, 1, 1]
  );
});

/* Two takes on two chains are still two readings on one scale: what a
   change of phone costs is the join, not the history. */
test('two benchmarks on two chains draw a mark each against one shared scale', () => {
  const series = ownSeries([take(1, PIXEL), take(2, SAMSUNG)], 'rate');
  assert.equal(series.runs.length, 2);
  assert.equal(series.readings, 2);
  assert.ok(series.scale && series.scale.min < 141 && series.scale.max > 142);
});

test('one benchmark has no trend to draw and says how many readings there are', () => {
  const series = ownSeries([take(1, PIXEL)], 'rate');
  assert.deepEqual(series.runs, []);
  assert.equal(series.scale, null);
  assert.equal(series.readings, 1);
});

test('no benchmarks at all is no readings', () => {
  const series = ownSeries([], 'rate');
  assert.deepEqual(series.runs, []);
  assert.equal(series.readings, 0);
});

/* A take whose vowel step was skipped measured no resonance and no room.
   The position stays on the plot - it is a benchmark, and the figure beside
   it has a reading there - and the line breaks at it the way any unlogged
   position breaks a line. */
test('a figure a take did not measure is a gap in the run, not a run of its own', () => {
  const series = ownSeries(
    [take(1, PIXEL), take(2, PIXEL, { f1Hz: null, f2Hz: null }), take(3, PIXEL)],
    'resonance'
  );
  assert.equal(series.runs.length, 1);
  assert.deepEqual(
    series.runs[0].points.map((point) => point.y),
    [601, null, 603]
  );
  assert.deepEqual(series.runs[0].second, [1401, null, 1403]);
  assert.equal(series.readings, 2);
});

test('a figure no take has ever measured has nothing to draw', () => {
  const never = [take(1, PIXEL, { snrDb: null }), take(2, PIXEL, { snrDb: null })];
  const series = ownSeries(never, 'room');
  assert.deepEqual(series.runs, []);
  assert.equal(series.readings, 0);
});

/* The span figure is one range with two ends, so both ends are placed
   against one scale: two scales would draw the high end and the low end as
   two independent lines and the range between them would mean nothing. */
test('the two ends of the pitch span share one scale', () => {
  const series = ownSeries([take(1, PIXEL), take(2, PIXEL)], 'span');
  assert.deepEqual(series.runs[0].points.map((point) => point.y), [201, 202]);
  assert.deepEqual(series.runs[0].second, [121, 122]);
  assert.deepEqual(series.secondScale, series.scale);
  assert.ok(series.scale && series.scale.min < 121 && series.scale.max > 202);
});

/* The two formants are two measures rather than two ends of one, and they
   sit an octave apart: one scale would flatten F1 against F2's range. */
test('the two formants keep a scale each', () => {
  const series = ownSeries([take(1, PIXEL), take(2, PIXEL)], 'resonance');
  assert.ok(series.scale && series.scale.max < 700);
  assert.ok(series.secondScale && series.secondScale.min > 1300);
});

test('a semitone figure and a decibel figure are read in their own units', () => {
  const spread = ownSeries([take(100, PIXEL), take(200, PIXEL)], 'spread');
  assert.deepEqual(spread.runs[0].points.map((point) => point.y), [3, 4]);

  const room = ownSeries([take(100, PIXEL), take(200, PIXEL)], 'room');
  assert.deepEqual(room.runs[0].points.map((point) => point.y), [30, 40]);
});

/* Checked over the registry rather than over a list written here: every
   figure filed as Own-series draws a trend. The literal key list beside it
   is the review gate - a sixth Own-series figure fails this test on the
   way in, which is where the question "does it have a trend, and in what
   units" belongs. */
test('every Own-series figure in the registry draws a trend', () => {
  assert.deepEqual(
    OWN_SERIES_METRICS.map((metric) => metric.key),
    ['span', 'spread', 'rate', 'resonance', 'room', 'scale']
  );

  for (const metric of OWN_SERIES_METRICS) {
    const series = ownSeries([take(1, PIXEL), take(2, PIXEL)], metric.key);
    assert.equal(series.runs.length, 1, metric.key);
    assert.equal(series.runs[0].points.length, 2, metric.key);
    assert.ok(series.scale, metric.key);
    assert.equal(series.readings, 2, metric.key);
  }
});

/* What the plot needs in order to decide whether it may print a value
   gutter: two ends of one range have numbers in common to print, two
   measures on two ranges do not. */
test('only a two-ended figure says its second line shares the scale', () => {
  const takes = [take(1, PIXEL), take(2, PIXEL)];
  assert.equal(ownSeries(takes, 'span').secondScaleShared, true);
  assert.equal(ownSeries(takes, 'resonance').secondScaleShared, false);
  assert.equal(ownSeries(takes, 'rate').secondScaleShared, false);
  assert.equal(ownSeries([take(1, PIXEL)], 'span').secondScaleShared, false);
});
