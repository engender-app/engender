import assert from 'node:assert/strict';
import { test } from 'vitest';
import { acousticDelta, type BenchmarkForDelta } from './benchmarkDelta.ts';

const benchmark = (over: Partial<BenchmarkForDelta> = {}): BenchmarkForDelta => ({
  passageKey: 'builtin-en',
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
