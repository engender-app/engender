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
  pitchAxis
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
