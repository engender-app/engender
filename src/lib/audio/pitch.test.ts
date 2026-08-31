import assert from 'node:assert/strict';
import { test } from 'vitest';
import { concat, mix, noise, silence, sine, vowel, wobblingSine } from './test-support/synth.ts';
import { noteName, trackPitch, wordsPerMinute } from './pitch.ts';

/* YIN accuracy (ticket 15's first acceptance criterion): a synthesized sine
   has the frequency it was built at, so the tolerance is arithmetic rather
   than a fixture's claim about somebody's voice. */

test('a sine comes back within 1 Hz across the speaking range', () => {
  for (const hz of [85, 110, 145, 180, 220, 265, 310, 350]) {
    const track = trackPitch(sine(hz, 1).samples, 16000);
    assert.ok(track.stats, `${hz} Hz read as unvoiced`);
    assert.ok(
      Math.abs(track.stats.medianHz - hz) <= 1,
      `${hz} Hz came back as ${track.stats.medianHz.toFixed(2)} Hz`
    );
  }
});

test('a harmonic vowel reads its fundamental, not an overtone', () => {
  const track = trackPitch(
    vowel({ f0Hz: 165, formants: [{ hz: 700 }, { hz: 1200 }], seconds: 1 }).samples,
    16000
  );
  assert.ok(track.stats);
  assert.ok(Math.abs(track.stats.medianHz - 165) <= 1, `read ${track.stats.medianHz.toFixed(2)} Hz`);
});

test('median F0 carries the musical note it lands on', () => {
  assert.equal(noteName(440), 'A4');
  assert.equal(noteName(220), 'A3');
  assert.equal(noteName(261.6), 'C4');
  // Between two notes, the nearer one wins rather than the lower one.
  assert.equal(noteName(233.1), 'A#3');
});

test('the percentile span, not a filter, is what excludes the outliers', () => {
  // A steady middle with one octave-low creak at the end: the p10/p90 span
  // stays on the steady part, while a plain min/max would swallow the creak.
  const track = trackPitch(concat(sine(200, 2), sine(95, 0.15)).samples, 16000);
  assert.ok(track.stats);
  assert.ok(track.stats.p10Hz > 190, `p10 was ${track.stats.p10Hz.toFixed(1)} Hz`);
  assert.ok(track.stats.p90Hz < 210, `p90 was ${track.stats.p90Hz.toFixed(1)} Hz`);
});

test('a steady tone has near-zero semitone spread and a wobbling one does not', () => {
  const steady = trackPitch(sine(200, 2).samples, 16000);
  const wobbling = trackPitch(wobblingSine(200, 2, 2).samples, 16000);
  assert.ok(steady.stats && wobbling.stats);
  assert.ok(steady.stats.semitoneSd < 0.1, `steady spread was ${steady.stats.semitoneSd}`);
  assert.ok(wobbling.stats.semitoneSd > 1, `wobbling spread was ${wobbling.stats.semitoneSd}`);
});

test('silence yields a track with no stats rather than an invented pitch', () => {
  const track = trackPitch(silence(1).samples, 16000);
  assert.equal(track.stats, null);
  assert.equal(track.voicedSeconds, 0);
  assert.equal(track.longestVoicedSeconds, 0);
});

test('noise alone is not voiced', () => {
  const track = trackPitch(noise(1, 16000, 0.4).samples, 16000);
  assert.equal(track.stats, null);
});

test('voiced time counts the speech and not the room tone around it', () => {
  const track = trackPitch(
    concat(silence(0.5), mix(sine(180, 1), noise(1, 16000, 0.005)), silence(0.5)).samples,
    16000
  );
  assert.ok(Math.abs(track.voicedSeconds - 1) < 0.12, `voiced ${track.voicedSeconds}s`);
  assert.ok(Math.abs(track.longestVoicedSeconds - 1) < 0.12, `run ${track.longestVoicedSeconds}s`);
  assert.ok(Math.abs(track.spokenSeconds - 1) < 0.12, `spoken ${track.spokenSeconds}s`);
});

test('a pause inside speech splits the longest run but not the total', () => {
  const track = trackPitch(concat(sine(180, 1), silence(0.4), sine(180, 0.5)).samples, 16000);
  assert.ok(Math.abs(track.voicedSeconds - 1.5) < 0.15, `voiced ${track.voicedSeconds}s`);
  assert.ok(Math.abs(track.longestVoicedSeconds - 1) < 0.12, `run ${track.longestVoicedSeconds}s`);
  // Speaking rate counts the pause between words, so the span is the whole
  // stretch from the first voiced frame to the last.
  assert.ok(Math.abs(track.spokenSeconds - 1.9) < 0.15, `spoken ${track.spokenSeconds}s`);
});

test('words per minute is the passage word count over the time it took', () => {
  assert.equal(wordsPerMinute(120, 60), 120);
  assert.equal(wordsPerMinute(50, 30), 100);
  assert.equal(wordsPerMinute(10, 0), null);
});
