import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  DEFAULT_PITCH_AXIS,
  REFERENCE_BANDS,
  TYPICAL_RANGES,
  axisFraction,
  bandEdges,
  comfortBand,
  overlapOf,
  pitchAxis,
  spreadLabels
} from './bands.ts';

/* The absolute axis and the bands on it (phase 8 features ticket 09,
   seam 2, ADR-0059). The figures themselves are the ADR's; what is proved
   here is that the overlap is computed rather than asserted, that the axis
   always contains the bands, and that the mapping is a semitone-linear one
   so a fixed pitch change is a fixed distance wherever it happens. */

test('the two typical ranges are the ADR figures, and they do overlap', () => {
  assert.deepEqual(
    TYPICAL_RANGES.map((band) => [band.key, band.lowHz, band.highHz]),
    [
      ['cisMan', 85, 180],
      ['cisWoman', 165, 255]
    ]
  );
});

test('the overlap band is the intersection, not a border drawn between two blocks', () => {
  const [man, woman] = TYPICAL_RANGES;
  assert.deepEqual(overlapOf(man, woman), { key: 'overlap', lowHz: 165, highHz: 180 });
  // Order does not decide it, and two ranges that do not meet have no
  // overlap band at all rather than an inverted one.
  assert.deepEqual(overlapOf(woman, man), { key: 'overlap', lowHz: 165, highHz: 180 });
  assert.equal(overlapOf({ key: 'cisMan', lowHz: 85, highHz: 155 }, woman), null);
});

test('the reference bands are the two ranges plus the overlap as its own band', () => {
  assert.deepEqual(
    REFERENCE_BANDS.map((band) => band.key),
    ['cisMan', 'cisWoman', 'overlap']
  );
});

test('the default axis holds every reference band with room to spare', () => {
  for (const band of REFERENCE_BANDS) {
    assert.ok(band.lowHz > DEFAULT_PITCH_AXIS.lowHz, `${band.key} sits on the floor`);
    assert.ok(band.highHz < DEFAULT_PITCH_AXIS.highHz, `${band.key} sits on the ceiling`);
  }
});

test('a voice outside the reference bands widens the axis rather than being clipped', () => {
  const low = pitchAxis({ hz: [62] });
  assert.ok(low.lowHz < 62, `${low.lowHz} Hz does not clear a 62 Hz voice`);
  assert.equal(low.highHz, DEFAULT_PITCH_AXIS.highHz);

  const high = pitchAxis({ hz: [420] });
  assert.ok(high.highHz > 420, `${high.highHz} Hz does not clear a 420 Hz voice`);
  assert.equal(high.lowHz, DEFAULT_PITCH_AXIS.lowHz);
});

test('a voice inside the reference bands leaves the axis exactly where it was', () => {
  // Two takes months apart have to be read against the same axis, so an
  // ordinary voice never moves it.
  assert.deepEqual(pitchAxis({ hz: [110, 180, null, 240] }), DEFAULT_PITCH_AXIS);
  assert.deepEqual(pitchAxis({}), DEFAULT_PITCH_AXIS);
});

test('a comfort band outside the reference bands widens the axis too', () => {
  const axis = pitchAxis({ comfort: { lowHz: 300, highHz: 330 } });
  assert.ok(axis.highHz > 330, `${axis.highHz} Hz does not clear a 330 Hz comfort band`);
});

test('the axis maps low to the bottom, high to the top, and clamps outside', () => {
  const axis = DEFAULT_PITCH_AXIS;
  assert.equal(axisFraction(axis.lowHz, axis), 0);
  assert.equal(axisFraction(axis.highHz, axis), 1);
  assert.equal(axisFraction(10, axis), 0);
  assert.equal(axisFraction(4000, axis), 1);
});

test('the axis is semitone-linear, so an octave is the same distance anywhere on it', () => {
  const axis = pitchAxis({});
  const lowOctave = axisFraction(200, axis) - axisFraction(100, axis);
  const halfOctave = axisFraction(150, axis) - axisFraction(106.066, axis);
  assert.ok(Math.abs(lowOctave - 2 * halfOctave) < 1e-3, `${lowOctave} vs ${halfOctave}`);
});

test('the gridlines are the band edges themselves, deduplicated and in order', () => {
  // 165 is both the woman band's floor and the overlap's, and it is one
  // line on the figure rather than two.
  assert.deepEqual(bandEdges(), [85, 165, 180, 255]);
});

test('a comfort band is the person\'s own, and there is no default one', () => {
  assert.equal(comfortBand(null, null), null);
  assert.equal(comfortBand(190, null), null);
  assert.equal(comfortBand(null, 220), null);
  assert.deepEqual(comfortBand(190, 220), { lowHz: 190, highHz: 220 });
});

test('a comfort band typed in backwards is read the way round it was meant', () => {
  assert.deepEqual(comfortBand(220, 190), { lowHz: 190, highHz: 220 });
});

test('a comfort band outside what a voice can be is not a band', () => {
  assert.equal(comfortBand(20, 220), null);
  assert.equal(comfortBand(190, 900), null);
  assert.equal(comfortBand(200, 200), null);
});

test('two gutter labels too close together are pushed apart, not dropped', () => {
  /* 165 and 180 Hz are under six per cent of the axis apart, so at the
     390px floor their two numbers overlap into one unreadable smudge -
     which is what the first render of the figure did. Both numbers are
     load-bearing, so they move rather than one of them going. */
  const axis = DEFAULT_PITCH_AXIS;
  const at = bandEdges().map((hz) => (1 - axisFraction(hz, axis)) * 100);
  const spread = spreadLabels(at, 9);

  assert.equal(spread.length, at.length);
  for (let i = 1; i < spread.length; i++) {
    assert.ok(spread[i - 1] - spread[i] >= 9 - 1e-9, `${spread[i - 1]} and ${spread[i]} still collide`);
  }
  // The two that were already clear of each other did not move.
  assert.equal(spread[0], at[0]);
  assert.equal(spread[3], at[3]);
});

test('labels already far enough apart are left exactly where they were', () => {
  assert.deepEqual(spreadLabels([90, 60, 30, 0], 9), [90, 60, 30, 0]);
});

test('a pushed pair stays centred on where it was', () => {
  // Two labels 4 apart, wanting 10: each moves 3, so the middle holds.
  assert.deepEqual(spreadLabels([52, 48], 10), [55, 45]);
});

test('spreading never runs a label off the top or bottom of the box', () => {
  const spread = spreadLabels([99, 98, 2, 1], 9);
  for (const at of spread) {
    assert.ok(at >= 0 && at <= 100, `${at} is outside the box`);
  }
});
