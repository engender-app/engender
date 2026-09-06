import assert from 'node:assert/strict';
import { test } from 'vitest';
import { clipped, mix, noise, sine } from './test-support/synth.ts';
import { makeLiveGauge, type LiveGauge } from './live.ts';
import { trackPitch } from './pitch.ts';
import { VOWEL_CHECKS, assessQuality, takeSignals } from './quality.ts';

/* The live gauge. Its whole reason to exist is that it
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
  assessQuality(takeSignals(samples, 16000, trackPitch(samples, 16000)), VOWEL_CHECKS);

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

test('it counts the seconds it was given', () => {
  const { samples } = mix(sine(190, 2, 16000, 0.4), noise(2, 16000, 0.004));
  assert.ok(Math.abs(gaugeOver(samples, 999).secondsCaptured() - 2) < 1e-9);
});

/* What this proves: the poll used to re-aggregate every sample
   captured so far, so a five-minute take cost thirty times what a ten-second
   one did and a single read ate the phone's whole frame budget somewhere
   around a minute in. It kept the take to do it with, in a buffer that
   doubled.

   Both halves of that are one test, because they have one cause and five
   minutes of synthesized take is the expensive part of asking - the tier is
   the one that runs on every change (docs/agents/verification.md). The take
   arrives the way the microphone delivers it, a second at a time, from a
   buffer the test reuses so that the only thing growing with the take is
   whatever the gauge decided to keep. */

const pushSeconds = (gauge: LiveGauge, seconds: number) => {
  const second = mix(sine(190, 1, 16000, 0.4), noise(1, 16000, 0.004)).samples;
  for (let i = 0; i < seconds; i++) gauge.push(second);
};

const costOf500Reads = (gauge: LiveGauge) => {
  gauge.read();
  const started = performance.now();
  for (let i = 0; i < 500; i++) gauge.read();
  return performance.now() - started;
};

test('a poll costs the same at five minutes of take as at ten seconds, and keeps none of it', () => {
  const brief = makeLiveGauge(16000, VOWEL_CHECKS);
  pushSeconds(brief, 10);
  const short = costOf500Reads(brief);

  // Each file in this tier gets its own process, so the buffers counted here
  // are this test's - and the gauge above is garbage by now, which can only
  // make the reading below smaller.
  const before = process.memoryUsage().arrayBuffers;
  const long = makeLiveGauge(16000, VOWEL_CHECKS);
  pushSeconds(long, 300);
  const held = process.memoryUsage().arrayBuffers - before;

  // A ratio rather than a millisecond budget, so this asserts the shape of
  // the cost and not the speed of the machine it ran on. Thirty times the
  // take: linear would be near 30, flat is near 1, and 3 leaves room for a
  // loaded runner without letting the old behaviour back through.
  const cost = costOf500Reads(long);
  assert.ok(cost < short * 3, `${short.toFixed(1)} ms at 10 s, ${cost.toFixed(1)} ms at 300 s`);

  // Five minutes at 16 kHz is 19.2 MB of Float32Array, and the gauge used to
  // hold all of it. What it needs is the tail a frame still reads from and
  // the two level histograms, which come to a sixth of a megabyte together
  // and are the same size at ten seconds as at ten minutes.
  assert.ok(held < 2_000_000, `${(held / 1e6).toFixed(1)} MB held after a 300 s take`);
  assert.deepEqual(long.read().failed, []);
}, 120_000);
