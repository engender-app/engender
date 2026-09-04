import assert from 'node:assert/strict';
import { test } from 'vitest';
import { vowel } from './test-support/synth.ts';
import { trackPitch } from './pitch.ts';
import { analyseFormants } from './resonance.ts';
import { fitFormantScale, type VowelFormants, type VowelLabel } from './vowelScale.ts';

/* Real formants off a real synthesized vowel, the way resonance.test.ts
   builds its own cases - this module's own tests fit across several of
   those rather than reading exact numbers, which is the thing it exists to
   do. */
const REFERENCE: Record<VowelLabel, { f1: number; f2: number }> = {
  a: { f1: 700, f2: 1200 },
  i: { f1: 300, f2: 2300 },
  u: { f1: 320, f2: 800 }
};

function readingAt(vowelLabel: VowelLabel, scale: number): VowelFormants {
  const reference = REFERENCE[vowelLabel];
  const signal = vowel({
    f0Hz: 130,
    formants: [{ hz: reference.f1 * scale }, { hz: reference.f2 * scale }, { hz: 2900 * scale }],
    seconds: 1
  });
  const track = trackPitch(signal.samples, signal.sampleRate);
  const formants = analyseFormants(signal.samples, signal.sampleRate, track);
  assert.ok(formants, `no formants recovered for ${vowelLabel} at scale ${scale}`);
  return { vowel: vowelLabel, formants };
}

test('three vowels at a common scale recover that scale', () => {
  const scale = fitFormantScale([readingAt('a', 1.15), readingAt('i', 1.15), readingAt('u', 1.15)]);
  assert.ok(scale !== null);
  assert.ok(Math.abs(scale - 1.15) <= 0.1, `${scale} against 1.15`);
});

test('two vowels are enough to fit', () => {
  const scale = fitFormantScale([readingAt('a', 0.9), readingAt('u', 0.9)]);
  assert.ok(scale !== null);
  assert.ok(Math.abs(scale - 0.9) <= 0.1, `${scale} against 0.9`);
});

test('one vowel is not enough - a factor fitted to it would be that vowel', () => {
  assert.equal(fitFormantScale([readingAt('a', 1.1)]), null);
});

test('no vowels at all is not enough', () => {
  assert.equal(fitFormantScale([]), null);
});

test('a scale of one recovers as one, the reference anchor unmoved', () => {
  const scale = fitFormantScale([readingAt('a', 1), readingAt('i', 1), readingAt('u', 1)]);
  assert.ok(scale !== null);
  assert.ok(Math.abs(scale - 1) <= 0.1, `${scale} against 1`);
});
