import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  DEFAULT_PITCH_AXIS,
  axisFraction,
  bandEdges,
  bandsFor,
  comfortBand,
  middleBand,
  pitchAxis,
  referenceBands,
  semitonesFrom,
  spreadLabels,
  STEADINESS_SEMITONES,
  steadinessAxis,
  steadinessTicks,
  typicalRanges
} from './bands.ts';

/* The absolute axis and the bands on it (phase 8 features ticket 09,
   seam 2, ADR-0059). The figures themselves are the ADR's; what is proved
   here is that they are per language and derived from the published mean
   and SD, that the middle band is computed rather than asserted, that the
   axis always contains the bands, and that the mapping is semitone-linear
   so a fixed pitch change is a fixed distance wherever it happens. */

test('the ranges are mean +/- one SD of the cited population, per language', () => {
  // Leung, Oates, Papp & Chan 2022: 115 (21) and 199 (28).
  assert.deepEqual(
    typicalRanges('en').map((band) => [band.key, band.lowHz, band.highHz]),
    [
      ['cisMan', 94, 136],
      ['cisWoman', 171, 227]
    ]
  );
  // Andreeva et al. 2014a: 163 (22) and 266 (24).
  assert.deepEqual(
    typicalRanges('pl').map((band) => [band.key, band.lowHz, band.highHz]),
    [
      ['cisMan', 141, 185],
      ['cisWoman', 242, 290]
    ]
  );
});

test('a Polish cis man sits inside no band the English figures would have drawn him in', () => {
  /* The whole reason the bands are per language. Andreeva's own words: the
     register of Polish male speakers "is in the same range of absolute f0
     values as that of English and German female speakers". A Polish man at
     163 Hz read against the English bands lands between them; read against
     his own, he is in the middle of his own range. */
  const [enMan, enWoman] = typicalRanges('en');
  assert.ok(163 > enMan.highHz, 'the English man band would not have held him');
  const [plMan] = typicalRanges('pl');
  assert.ok(163 >= plMan.lowHz && 163 <= plMan.highHz, 'the Polish man band does');
  // And the figure that would have been wrong in the direction that hurts:
  // 190 Hz is inside the English cis woman band and inside the Polish man
  // distribution at the same time.
  assert.ok(190 >= enWoman.lowHz && 190 <= enWoman.highHz);
  assert.ok(190 <= typicalRanges('pl')[0].highHz + 5);
});

test('the middle band is computed, and says whether it is an overlap or a gap', () => {
  for (const language of ['en', 'pl'] as const) {
    const [man, woman] = typicalRanges(language);
    const middle = middleBand(man, woman);
    assert.ok(middle, `${language} has no middle band`);
    // Neither language's ranges meet on sourced data, so both middles are
    // gaps. The overlap arm stays because the arithmetic decides, not this
    // test - see the synthetic pair below.
    assert.equal(middle.kind, 'gap');
    assert.equal(middle.lowHz, man.highHz);
    assert.equal(middle.highHz, woman.lowHz);
  }
});

test('two ranges that do meet produce an overlap rather than a gap', () => {
  const middle = middleBand(
    { key: 'cisMan', lowHz: 85, highHz: 180 },
    { key: 'cisWoman', lowHz: 165, highHz: 255 }
  );
  assert.deepEqual(middle, { key: 'between', kind: 'overlap', lowHz: 165, highHz: 180 });
});

test('order does not decide the middle band', () => {
  const [man, woman] = typicalRanges('en');
  assert.deepEqual(middleBand(woman, man), middleBand(man, woman));
});

test('two ranges that touch exactly have no middle band at all', () => {
  assert.equal(
    middleBand({ key: 'cisMan', lowHz: 90, highHz: 170 }, { key: 'cisWoman', lowHz: 170, highHz: 240 }),
    null
  );
});

test('the reference bands are the two ranges plus the middle one', () => {
  assert.deepEqual(referenceBands('en').map((band) => band.key), ['cisMan', 'cisWoman', 'between']);
  assert.deepEqual(referenceBands('pl').map((band) => band.key), ['cisMan', 'cisWoman', 'between']);
});

test('the default axis holds every band of every language with room to spare', () => {
  for (const language of ['en', 'pl'] as const) {
    for (const band of referenceBands(language)) {
      assert.ok(band.lowHz > DEFAULT_PITCH_AXIS.lowHz, `${language} ${band.key} sits on the floor`);
      assert.ok(band.highHz < DEFAULT_PITCH_AXIS.highHz, `${language} ${band.key} sits on the ceiling`);
    }
  }
});

test('the bands follow the passage that was read, not the app', () => {
  // builtInPassageKey's own shape (data/voice/passages.ts). A built-in
  // passage says which language it is, so nothing is guessed.
  assert.deepEqual(bandsFor('builtin-pl', 'en'), { language: 'pl', guessed: false });
  assert.deepEqual(bandsFor('builtin-en', 'pl'), { language: 'en', guessed: false });
});

test("a passage with no language of its own falls back, and says it guessed", () => {
  // A custom passage carries a fingerprint, and the practise tab reads
  // nothing at all (Alicja, 2026-09-04: fall back to the app's language).
  assert.deepEqual(bandsFor('custom-1a2b3c4d', 'pl'), { language: 'pl', guessed: true });
  assert.deepEqual(bandsFor('', 'en'), { language: 'en', guessed: true });
  // A language with no published figures: English, rather than no bands at
  // all or a crash. Still a guess, because it is not this passage's own.
  assert.deepEqual(bandsFor('builtin-de', 'de'), { language: 'en', guessed: false });
  assert.deepEqual(bandsFor('', 'de'), { language: 'en', guessed: true });
});

test('a voice outside the bands widens the axis rather than being clipped', () => {
  const low = pitchAxis({ hz: [62] });
  assert.ok(low.lowHz < 62, `${low.lowHz} Hz does not clear a 62 Hz voice`);
  assert.equal(low.highHz, DEFAULT_PITCH_AXIS.highHz);

  const high = pitchAxis({ hz: [420] });
  assert.ok(high.highHz > 420, `${high.highHz} Hz does not clear a 420 Hz voice`);
  assert.equal(high.lowHz, DEFAULT_PITCH_AXIS.lowHz);
});

test('a voice inside the bands leaves the axis exactly where it was', () => {
  // Two takes months apart have to be read against the same axis, so an
  // ordinary voice never moves it - in either language.
  assert.deepEqual(pitchAxis({ hz: [110, 180, null, 240] }), DEFAULT_PITCH_AXIS);
  assert.deepEqual(pitchAxis({ hz: [163, 266] }), DEFAULT_PITCH_AXIS);
  assert.deepEqual(pitchAxis({}), DEFAULT_PITCH_AXIS);
});

test('a comfort band outside the bands widens the axis too', () => {
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

test('the gridlines are the band edges of the language being read', () => {
  // The middle band's edges are the two ranges' own, so four lines and not
  // six.
  assert.deepEqual(bandEdges('en'), [94, 136, 171, 227]);
  assert.deepEqual(bandEdges('pl'), [141, 185, 242, 290]);
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
  const at = bandEdges('en').map((hz) => (1 - axisFraction(hz, axis)) * 100);
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

/* The vowel step's own instrument (Alicja, 2026-09-04): semitones around
   the note being held, because that step's task is keeping one pitch rather
   than reaching one. */

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
