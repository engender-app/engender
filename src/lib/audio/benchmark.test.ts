import assert from 'node:assert/strict';
import { test } from 'vitest';
import { concat, mix, noise, silence, sine, vowel, wobblingSine } from './test-support/synth.ts';
import { analysePassage, analyseVowel } from './benchmark.ts';

/* Which questions get asked of which take (ticket 15, seam 3). */

/** A read passage: pitch that moves, with pauses in it, over room tone. */
const readAloud = () =>
  mix(
    concat(wobblingSine(185, 2, 2), silence(0.4), wobblingSine(175, 2, 2)),
    noise(4.4, 16000, 0.004)
  );

test('a read passage carries pitch, span, spread and a speaking rate', () => {
  const take = analysePassage(readAloud().samples, 16000, 99);
  assert.ok(take.figures);
  assert.ok(take.figures.f0MedianHz > 150 && take.figures.f0MedianHz < 220);
  assert.ok(take.figures.f0P10Hz < take.figures.f0MedianHz);
  assert.ok(take.figures.f0P90Hz > take.figures.f0MedianHz);
  assert.ok(take.figures.semitoneSd > 0);
  // 99 words over the ~4.4s span between the first and last voiced frame.
  assert.ok(
    take.figures.wordsPerMinute > 1250 && take.figures.wordsPerMinute < 1400,
    `rate was ${take.figures.wordsPerMinute.toFixed(0)}`
  );
});

test('a passage is not failed for moving in pitch', () => {
  const take = analysePassage(readAloud().samples, 16000, 99);
  assert.deepEqual(take.quality.failed, []);
});

test('a passage with nothing voiced in it reports no figures and fails the gate', () => {
  const take = analysePassage(noise(4, 16000, 0.2).samples, 16000, 99);
  assert.equal(take.figures, null);
  assert.equal(take.quality.passed, false);
});

test('a held vowel carries its two resonances and clears all four checks', () => {
  const held = mix(
    vowel({ f0Hz: 180, formants: [{ hz: 700 }, { hz: 1250 }, { hz: 2900 }], seconds: 3 }),
    noise(3, 16000, 0.004)
  );
  const take = analyseVowel(held.samples, 16000);

  assert.deepEqual(take.quality.failed, []);
  assert.ok(take.formants);
  assert.ok(Math.abs(take.formants.f1Hz - 700) <= 80, `F1 ${take.formants.f1Hz}`);
  assert.ok(Math.abs(take.formants.f2Hz - 1250) <= 120, `F2 ${take.formants.f2Hz}`);
});

test('a vowel that wandered in pitch is held to steadiness where a passage is not', () => {
  const wandering = mix(wobblingSine(190, 3, 3), noise(3, 16000, 0.004));
  assert.ok(analyseVowel(wandering.samples, 16000).quality.failed.includes('unsteady'));
  assert.ok(!analysePassage(wandering.samples, 16000, 99).quality.failed.includes('unsteady'));
});

test('a passage carries the track its picture is drawn from later', () => {
  /* Phase 8 features ticket 09: the figures alone could not be redrawn, so
     the passage take now also produces the downsampled track. Four seconds
     at four hertz is sixteen points, less the frames at the end that YIN
     needs the samples after to compute. */
  const take = analysePassage(sine(190, 4).samples, 16000, 100);
  assert.ok(take.pitchTrack, 'no track came back');
  const points = take.pitchTrack.split(',');
  assert.ok(points.length >= 14 && points.length <= 16, `${points.length} points`);
  for (const point of points) {
    assert.ok(Math.abs(Number(point) - 190) <= 1, `${point} Hz`);
  }
});

test('a passage with no voice in it has no track to store', () => {
  const take = analysePassage(silence(2).samples, 16000, 100);
  assert.equal(take.pitchTrack, null);
  assert.equal(take.figures, null);
});
