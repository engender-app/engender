import assert from 'node:assert/strict';
import { test } from 'vitest';
import { clipped, mix, noise, sine } from './test-support/synth.ts';
import { makeLiveGauge } from './live.ts';
import { trackPitch } from './pitch.ts';
import { VOWEL_CHECKS, assessQuality } from './quality.ts';

/* The live gauge (ticket 15, seam 3). Its whole reason to exist is that it
   computes each frame once, so what it has to prove is that feeding a take
   in pieces says the same thing as analysing it whole - otherwise the gauge
   would tell someone their take passed and the saved take would fail. */

const gaugeOver = (samples: Float32Array, chunkLength: number) => {
  const gauge = makeLiveGauge(16000, VOWEL_CHECKS);
  for (let at = 0; at < samples.length; at += chunkLength) {
    gauge.push(samples.subarray(at, Math.min(at + chunkLength, samples.length)));
  }
  return gauge;
};

const whole = (samples: Float32Array) =>
  assessQuality(samples, 16000, trackPitch(samples, 16000), VOWEL_CHECKS);

test('a take pushed in pieces reads the same as the same take analysed whole', () => {
  const { samples } = mix(sine(190, 3, 16000, 0.4), noise(3, 16000, 0.004));
  const live = gaugeOver(samples, 1024).read();
  const once = whole(samples);

  assert.deepEqual(live.failed, once.failed);
  assert.equal(live.passed, once.passed);
  assert.equal(live.peak, once.peak);
  assert.ok(
    Math.abs(live.longestVoicedSeconds - once.longestVoicedSeconds) < 0.02,
    `${live.longestVoicedSeconds} against ${once.longestVoicedSeconds}`
  );
});

test('the chunk size the microphone happens to deliver changes nothing', () => {
  const { samples } = mix(sine(210, 2.5, 16000, 0.4), noise(2.5, 16000, 0.004));
  const readings = [128, 1024, 4096, 20000].map((size) => gaugeOver(samples, size).read());

  for (const reading of readings) {
    assert.deepEqual(reading.failed, readings[0].failed);
    assert.equal(reading.longestVoicedSeconds, readings[0].longestVoicedSeconds);
  }
});

test('the verdict changes as the take grows, from too short to passing', () => {
  const { samples } = mix(sine(190, 3, 16000, 0.4), noise(3, 16000, 0.004));
  const gauge = makeLiveGauge(16000, VOWEL_CHECKS);

  gauge.push(samples.subarray(0, 16000));
  assert.ok(gauge.read().failed.includes('tooShort'), 'one second in, it is not a sustained vowel yet');

  gauge.push(samples.subarray(16000));
  assert.deepEqual(gauge.read().failed, []);
});

test('a take that goes into the rails halfway is caught from then on', () => {
  const clean = mix(sine(190, 2, 16000, 0.4), noise(2, 16000, 0.004));
  const gauge = makeLiveGauge(16000, VOWEL_CHECKS);

  gauge.push(clean.samples);
  assert.ok(!gauge.read().failed.includes('clipping'));

  gauge.push(clipped(clean).samples);
  assert.ok(gauge.read().failed.includes('clipping'));
});

test('what it captured is what the take is finally analysed from', () => {
  const { samples } = mix(sine(190, 2, 16000, 0.4), noise(2, 16000, 0.004));
  const gauge = gaugeOver(samples, 999);
  assert.deepEqual(Array.from(gauge.captured()), Array.from(samples));
  assert.ok(Math.abs(gauge.secondsCaptured() - 2) < 1e-9);
});
