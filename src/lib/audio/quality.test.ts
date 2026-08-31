import assert from 'node:assert/strict';
import { test } from 'vitest';
import { clipped, concat, mix, noise, silence, sine, wobblingSine } from './test-support/synth.ts';
import { trackPitch } from './pitch.ts';
import { PASSAGE_CHECKS, VOWEL_CHECKS, assessQuality } from './quality.ts';
import type { QualityCheck } from './quality.ts';

/* The gate (ticket 15, seam 1). Its failure modes are tested as carefully as
   its happy path: a gate that never rejects is worse than no gate, because
   it launders a bad take into a trend chart where nothing downstream can
   tell it from a good one. */

const assess = (
  signal: { samples: Float32Array; sampleRate: number },
  checks: readonly QualityCheck[] = VOWEL_CHECKS
) => assessQuality(signal.samples, signal.sampleRate, trackPitch(signal.samples, signal.sampleRate), checks);

/** A held vowel as a good take arrives: room tone under it, three seconds of
    it, level well short of the rails. */
const goodTake = () => mix(sine(190, 3, 16000, 0.4), noise(3, 16000, 0.004));

test('a clean sustained take passes every check', () => {
  const report = assess(goodTake());
  assert.deepEqual(report.failed, []);
  assert.equal(report.passed, true);
});

test('a take driven into the rails fails on clipping and says so', () => {
  const report = assess(clipped(goodTake()));
  assert.ok(report.failed.includes('clipping'), `failed: ${report.failed.join(', ')}`);
  assert.equal(report.passed, false);
  assert.ok(report.peak >= 0.98);
});

test('a take buried in room noise fails on noise', () => {
  const report = assess(mix(sine(190, 3, 16000, 0.06), noise(3, 16000, 0.3)));
  assert.ok(report.failed.includes('noise'), `failed: ${report.failed.join(', ')}`);
  assert.ok(report.snrDb < 15, `snr ${report.snrDb.toFixed(1)} dB`);
});

test('a take shorter than a second and a half of voicing fails on length', () => {
  const report = assess(mix(sine(190, 0.8, 16000, 0.4), noise(0.8, 16000, 0.004)));
  assert.ok(report.failed.includes('tooShort'), `failed: ${report.failed.join(', ')}`);
  assert.ok(report.longestVoicedSeconds < 1.5);
});

test('three seconds broken into bursts is not a sustained vowel', () => {
  const burst = () => mix(sine(190, 0.7, 16000, 0.4), noise(0.7, 16000, 0.004));
  const report = assess(concat(burst(), silence(0.3), burst(), silence(0.3), burst()));
  assert.ok(report.failed.includes('tooShort'), `failed: ${report.failed.join(', ')}`);
  assert.ok(report.voicedSeconds > 1.5, 'the total was long enough, the run was not');
});

test('a wandering pitch fails on steadiness', () => {
  const report = assess(mix(wobblingSine(190, 3, 3), noise(3, 16000, 0.004)));
  assert.ok(report.failed.includes('unsteady'), `failed: ${report.failed.join(', ')}`);
  assert.ok(report.f0Cv !== null && report.f0Cv > 0.08);
});

test('a passage is not held on one note, so steadiness is not asked of it', () => {
  const report = assess(mix(wobblingSine(190, 3, 3), noise(3, 16000, 0.004)), PASSAGE_CHECKS);
  assert.deepEqual(report.failed, []);
});

test('several things wrong at once are all named, not just the first', () => {
  const report = assess(clipped(mix(sine(190, 0.8, 16000, 0.4), noise(0.8, 16000, 0.2)), 6));
  assert.ok(report.failed.includes('clipping'));
  assert.ok(report.failed.includes('tooShort'));
  assert.ok(report.failed.length >= 2, `failed: ${report.failed.join(', ')}`);
});

test('a take with no voice in it at all is rejected, not passed on empty', () => {
  const report = assess(noise(3, 16000, 0.2));
  assert.equal(report.passed, false);
  assert.ok(report.failed.includes('tooShort'));
  assert.equal(report.f0Cv, null);
});

test('silence is rejected rather than read as a perfectly steady take', () => {
  const report = assess(silence(3));
  assert.equal(report.passed, false);
  assert.ok(report.failed.includes('tooShort'));
});
