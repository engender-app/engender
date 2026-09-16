import assert from 'node:assert/strict';
import { test } from 'vitest';
import { captureChainOf } from '../../audio/captureChain.ts';
import { voiceMetricFigure, type BenchmarkForMetricFigure } from './metricFigures.ts';

const PIXEL = captureChainOf('Pixel 10a', 'Bottom microphone', {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false
});

function take(epochDay: number, over: Partial<BenchmarkForMetricFigure> = {}): BenchmarkForMetricFigure {
  return {
    epochDay,
    passageKey: 'builtin-en',
    captureChain: PIXEL,
    f0MedianHz: 160 + epochDay,
    f0P10Hz: 120 + epochDay,
    f0P90Hz: 200 + epochDay,
    semitoneSd: 2 + epochDay / 100,
    wordsPerMinute: 140 + epochDay,
    f1Hz: 600 + epochDay,
    f2Hz: 1400 + epochDay,
    snrDb: 20 + epochDay / 10,
    resonanceScale: 0.9 + epochDay / 100,
    ...over
  };
}

test('pitch draws an axis around the last take with its passage-language bands', () => {
  const figure = voiceMetricFigure([take(1), take(2)], 'pitch', 'en');
  assert.ok(figure);
  assert.equal(figure!.value, 162);
  assert.ok(figure!.low < 162 && figure!.high > 162);
  assert.ok(figure!.bands.length > 0);
});

test('a custom passage guesses the app locale for pitch bands rather than drawing none', () => {
  const figure = voiceMetricFigure([take(1, { passageKey: 'a passage nobody built in' })], 'pitch', 'pl');
  assert.ok(figure);
  assert.ok(figure!.bands.length > 0);
});

test('an own-series figure draws no band and axis bounds from its own trend', () => {
  const figure = voiceMetricFigure([take(1), take(2), take(3)], 'rate', 'en');
  assert.ok(figure);
  assert.deepEqual(figure!.bands, []);
  assert.equal(figure!.value, 143);
});

test('an own-series figure with fewer than two readings draws nothing (no trend to set an axis)', () => {
  assert.equal(voiceMetricFigure([take(1)], 'rate', 'en'), null);
});

test('nothing to draw with no benchmarks at all', () => {
  assert.equal(voiceMetricFigure([], 'pitch', 'en'), null);
  assert.equal(voiceMetricFigure([], 'rate', 'en'), null);
});
