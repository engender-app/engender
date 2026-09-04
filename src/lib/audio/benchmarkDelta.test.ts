import assert from 'node:assert/strict';
import { test } from 'vitest';
import { captureChainOf, type CaptureSettings } from './captureChain.ts';
import { acousticDelta, comparabilityBreak, type BenchmarkForDelta } from './benchmarkDelta.ts';

const UNPROCESSED: CaptureSettings = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

const PHONE = 'Pixel 10a | Bottom microphone | ec=off ns=off agc=off';
const HEADSET = 'Pixel 10a | Wired headset | ec=off ns=off agc=off';

const benchmark = (over: Partial<BenchmarkForDelta> = {}): BenchmarkForDelta => ({
  passageKey: 'builtin-en',
  captureChain: PHONE,
  f0MedianHz: 180,
  f1Hz: 690,
  f2Hz: 1240,
  ...over
});

test('doubling F0 is +12 semitones exactly - the off-by-a-log guard', () => {
  const delta = acousticDelta(benchmark({ f0MedianHz: 150 }), benchmark({ f0MedianHz: 300 }));
  assert.equal(delta?.f0DeltaHz, 150);
  assert.equal(delta?.f0DeltaSemitones, 12);
});

test('halving F0 is -12 semitones, not +12', () => {
  const delta = acousticDelta(benchmark({ f0MedianHz: 300 }), benchmark({ f0MedianHz: 150 }));
  assert.equal(delta?.f0DeltaHz, -150);
  assert.equal(delta?.f0DeltaSemitones, -12);
});

test('a perfect fifth is +7.02 semitones, not a round number a wrong base would give', () => {
  const delta = acousticDelta(benchmark({ f0MedianHz: 200 }), benchmark({ f0MedianHz: 300 }));
  assert.ok(Math.abs(delta!.f0DeltaSemitones - 7.0196) < 0.001);
});

test('no change is zero, not null', () => {
  const delta = acousticDelta(benchmark({ f0MedianHz: 180 }), benchmark({ f0MedianHz: 180 }));
  assert.equal(delta?.f0DeltaHz, 0);
  assert.equal(delta?.f0DeltaSemitones, 0);
});

test('F1/F2 deltas are the later take minus the earlier one', () => {
  const delta = acousticDelta(
    benchmark({ f1Hz: 650, f2Hz: 1200 }),
    benchmark({ f1Hz: 690, f2Hz: 1340 })
  );
  assert.equal(delta?.f1DeltaHz, 40);
  assert.equal(delta?.f2DeltaHz, 140);
});

test('a take with no resonance figures gives a null delta, not a false zero', () => {
  const delta = acousticDelta(benchmark({ f1Hz: null, f2Hz: null }), benchmark());
  assert.equal(delta?.f1DeltaHz, null);
  assert.equal(delta?.f2DeltaHz, null);
  // F0 still compares - only resonance depends on the vowel step.
  assert.equal(delta?.f0DeltaHz, 0);
});

test('different passages produce no delta at all', () => {
  const delta = acousticDelta(benchmark({ passageKey: 'builtin-en' }), benchmark({ passageKey: 'custom-abc123' }));
  assert.equal(delta, null);
});

/* ADR-0061's gate. The resonance figures are formants, which a phone
   measures differently on different equipment, so a delta across two
   chains is not a change in a voice. */
test('resonance refuses to compare across two capture chains', () => {
  const delta = acousticDelta(
    benchmark({ captureChain: PHONE, f1Hz: 650, f2Hz: 1200 }),
    benchmark({ captureChain: HEADSET, f1Hz: 690, f2Hz: 1340 })
  );
  assert.equal(delta?.sameChain, false);
  assert.equal(delta?.f1DeltaHz, null);
  assert.equal(delta?.f2DeltaHz, null);
});

test('pitch compares across capture chains, which is what makes it the referenced figure', () => {
  const delta = acousticDelta(
    benchmark({ captureChain: PHONE, f0MedianHz: 150 }),
    benchmark({ captureChain: HEADSET, f0MedianHz: 300 })
  );
  assert.equal(delta?.f0DeltaHz, 150);
  assert.equal(delta?.f0DeltaSemitones, 12);
});

test('resonance compares within one chain', () => {
  const delta = acousticDelta(
    benchmark({ f1Hz: 650, f2Hz: 1200 }),
    benchmark({ f1Hz: 690, f2Hz: 1340 })
  );
  assert.equal(delta?.sameChain, true);
  assert.equal(delta?.f1DeltaHz, 40);
  assert.equal(delta?.f2DeltaHz, 140);
});

test('a take that recorded no chain compares no resonance either way round', () => {
  const unrecorded = acousticDelta(benchmark({ captureChain: null }), benchmark());
  assert.equal(unrecorded?.sameChain, false);
  assert.equal(unrecorded?.f1DeltaHz, null);
  assert.equal(acousticDelta(benchmark(), benchmark({ captureChain: null }))?.f1DeltaHz, null);
  assert.equal(acousticDelta(benchmark({ captureChain: null }), benchmark({ captureChain: null }))?.sameChain, false);
});

/* The gate the own-series trend breaks its line on, which is the same gate
   the delta above is computed behind (phase 8 features ticket 29). */
test('a change of passage is the reason even when the phone changed with it', () => {
  const pixel = captureChainOf('Pixel 10a', 'mic', UNPROCESSED);
  const samsung = captureChainOf('SM-A546B', 'mic', UNPROCESSED);
  const read = (passageKey: string, captureChain: string | null) => ({ passageKey, captureChain });

  assert.equal(comparabilityBreak(read('rainbow', pixel), read('rainbow', pixel)), null);
  assert.equal(comparabilityBreak(read('rainbow', pixel), read('rainbow', samsung)), 'device');
  assert.equal(comparabilityBreak(read('rainbow', pixel), read('wiatr', pixel)), 'passage');
  assert.equal(comparabilityBreak(read('rainbow', pixel), read('wiatr', samsung)), 'passage');
  assert.equal(comparabilityBreak(read('rainbow', null), read('rainbow', pixel)), 'unrecorded');
});
