import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  DEFAULT_PITCH_AXIS, STEADINESS_SEMITONES, axisFraction, comfortBand,
  pitchAxis, plainHzTicks, semitonesFrom, spreadLabels, steadinessAxis,
  steadinessTicks
} from './bands.ts';

test('a voice outside the default axis widens the axis rather than being clipped', () => {
  const low = pitchAxis({ hz: [62] });
  assert.ok(low.lowHz < 62, `${low.lowHz} Hz does not clear a 62 Hz voice`);
  assert.equal(low.highHz, DEFAULT_PITCH_AXIS.highHz);

  const high = pitchAxis({ hz: [420] });
  assert.ok(high.highHz > 420, `${high.highHz} Hz does not clear a 420 Hz voice`);
  assert.equal(high.lowHz, DEFAULT_PITCH_AXIS.lowHz);
});

test('a voice inside the default axis leaves the axis exactly where it was', () => {
  // Two takes months apart have to be read against the same axis, so an
  // ordinary voice never moves it - in either language.
  assert.deepEqual(pitchAxis({ hz: [110, 180, null, 240] }), DEFAULT_PITCH_AXIS);
  assert.deepEqual(pitchAxis({ hz: [163, 266] }), DEFAULT_PITCH_AXIS);
  assert.deepEqual(pitchAxis({}), DEFAULT_PITCH_AXIS);
});

test('a comfort band outside the default axis widens the axis too', () => {
  const axis = pitchAxis({ comfort: { lowHz: 300, highHz: 340 } });
  assert.ok(axis.highHz > 340, `${axis.highHz} Hz does not clear a 340 Hz comfort band`);
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

test("a comfort band is the person's own, and there is no default one", () => {
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
  const axis = DEFAULT_PITCH_AXIS;
  const at = [100, 150, 200, 250].map((hz) => (1 - axisFraction(hz, axis)) * 100);
  const spread = spreadLabels(at, 9, 100);

  assert.equal(spread.length, at.length);
  for (let i = 1; i < spread.length; i++) {
    assert.ok(spread[i - 1] - spread[i] >= 9 - 1e-9, `${spread[i - 1]} and ${spread[i]} still collide`);
  }
});

test('labels already far enough apart are left exactly where they were', () => {
  assert.deepEqual(spreadLabels([90, 60, 30, 0], 9, 100), [90, 60, 30, 0]);
});

test('a pushed pair stays centred on where it was', () => {
  assert.deepEqual(spreadLabels([52, 48], 10, 100), [55, 45]);
});

test('spreading never runs a label off the top or bottom of the box', () => {
  const spread = spreadLabels([99, 98, 2, 1], 9, 100);
  for (const at of spread) {
    assert.ok(at >= 0 && at <= 100, `${at} is outside the box`);
  }
});

/* The vowel step's own instrument: semitones around the note being held, because that
   step's task is keeping one pitch rather than reaching one. */

test('a held note is judged on semitones around itself, not on hertz', () => {
  const axis = steadinessAxis(200);
  assert.ok(axis);
  // Three semitones either side, so the note sits exactly in the middle
  // whatever the note is.
  assert.equal(axisFraction(200, axis).toFixed(6), '0.500000');
  assert.ok(Math.abs(semitonesFrom(200, axis.highHz) - STEADINESS_SEMITONES) < 1e-9);
  assert.ok(Math.abs(semitonesFrom(200, axis.lowHz) + STEADINESS_SEMITONES) < 1e-9);
});

test('the same held note is the same picture wherever the voice sits', () => {
  // The point of a relative axis: a steady 120 Hz and a steady 260 Hz draw
  // the same flat line in the middle, which an absolute axis cannot do.
  for (const hz of [120, 200, 260]) {
    const axis = steadinessAxis(hz);
    assert.ok(axis);
    assert.equal(axisFraction(hz, axis).toFixed(6), '0.500000');
  }
});

test('nothing voiced yet is no axis, rather than an axis around zero', () => {
  assert.equal(steadinessAxis(null), null);
});

test('a steadiness gutter is one tick per semitone, centred on the note', () => {
  const ticks = steadinessTicks(200);
  assert.equal(ticks.length, STEADINESS_SEMITONES * 2 + 1);
  assert.deepEqual(
    ticks.map((hz) => Math.round(semitonesFrom(200, hz))),
    [-3, -2, -1, 0, 1, 2, 3]
  );
});

test('the steadiness window is wider than the wobble the gate refuses', () => {
  /* quality.ts fails a held vowel whose F0 coefficient of variation passes
     8%, which is about 1.4 semitones of spread. The window has to be wider
     than that or a take about to fail would already be off the edge of its
     own figure with nowhere left to move. */
  const failingSpreadSemitones = 12 * Math.log2(1 + 0.08);
  assert.ok(
    STEADINESS_SEMITONES > failingSpreadSemitones,
    `${STEADINESS_SEMITONES} st window against ${failingSpreadSemitones.toFixed(2)} st of failing wobble`
  );
});
