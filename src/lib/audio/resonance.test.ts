import assert from 'node:assert/strict';
import { test } from 'vitest';
import { noise, silence, vowel } from './test-support/synth.ts';
import { trackPitch } from './pitch.ts';
import { analyseFormants } from './resonance.ts';

/** Formants are only meaningful on the voiced frames, so the pitch track is
    the caller's to compute and hand over - once per take, not once per
    module (see resonance.ts's header). */
const formantsOf = (signal: { samples: Float32Array; sampleRate: number }) =>
  analyseFormants(signal.samples, signal.sampleRate, trackPitch(signal.samples, signal.sampleRate));

/* LPC formants (ticket 15's first acceptance criterion). A synthesized vowel
   is a harmonic source through one resonator per formant, so the formants it
   has are the ones it was built from, and the tolerance is how close the
   envelope's peaks land to them. */

const cases = [
  { name: 'an open vowel', f1: 700, f2: 1200 },
  { name: 'a close front vowel', f1: 300, f2: 2300 },
  { name: 'a mid back vowel', f1: 500, f2: 900 },
  { name: 'a low F1 with a high F2', f1: 400, f2: 2000 }
];

for (const shape of cases) {
  test(`${shape.name} recovers its two formants`, () => {
    const signal = vowel({
      f0Hz: 130,
      formants: [{ hz: shape.f1 }, { hz: shape.f2 }, { hz: 2900 }],
      seconds: 1
    });
    const formants = formantsOf(signal);
    assert.ok(formants, 'no formants found');
    assert.ok(
      Math.abs(formants.f1Hz - shape.f1) <= 80,
      `F1 ${formants.f1Hz.toFixed(0)} Hz against ${shape.f1} Hz`
    );
    assert.ok(
      Math.abs(formants.f2Hz - shape.f2) <= 120,
      `F2 ${formants.f2Hz.toFixed(0)} Hz against ${shape.f2} Hz`
    );
  });
}

test('a high voice does not report its own fundamental as F1', () => {
  const signal = vowel({ f0Hz: 260, formants: [{ hz: 800 }, { hz: 1800 }], seconds: 1 });
  const formants = formantsOf(signal);
  assert.ok(formants);
  assert.ok(Math.abs(formants.f1Hz - 800) <= 80, `F1 ${formants.f1Hz.toFixed(0)} Hz`);
});

test('silence has no resonance to report', () => {
  assert.equal(formantsOf(silence(1)), null);
});

test('a buffer too short to hold a frame reports nothing rather than guessing', () => {
  assert.equal(formantsOf(silence(0.005)), null);
});

test('room noise alone yields no formant pair', () => {
  // Not a vowel, and the honest answer is that this take has no resonance
  // to state - the same answer the gate gives it for a different reason.
  assert.equal(formantsOf(noise(1, 16000, 0.02)), null);
});
