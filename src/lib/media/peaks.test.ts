import assert from 'node:assert/strict';
import { test } from 'vitest';
import { peaksFromSamples, peaksFor, forgetPeaks, barsAt, barCountFor, PEAK_BUCKETS } from './peaks.ts';

/* The bars the waveform draws, and the promise that they are drawn once.

   What is proved here is that a bucket is the energy actually in that slice
   of the recording rather than a shape invented for it, that the loudest
   bucket sets the scale so a quiet recording is still visible without a
   quiet recording being redrawn as a loud one, and that a second mount of
   the same recording reads the first mount's answer. */

function samplesOf(length: number, at: (i: number) => number): Float32Array {
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) samples[i] = at(i);
  return samples;
}

test('a bucket per bar, however long the recording', () => {
  assert.equal(peaksFromSamples(samplesOf(48000, () => 0.5), 64).length, 64);
  assert.equal(peaksFromSamples(samplesOf(120, () => 0.5), 64).length, 64);
  assert.equal(peaksFromSamples(new Float32Array(0), 64).length, 64);
});

test('silence is flat, and does not become noise by being normalised', () => {
  const peaks = peaksFromSamples(samplesOf(4000, () => 0), 16);
  assert.deepEqual([...peaks], new Array(16).fill(0));
});

test('a steady tone is a steady bar', () => {
  const peaks = peaksFromSamples(samplesOf(4000, (i) => Math.sin(i / 10)), 8);
  for (const value of peaks) assert.ok(Math.abs(value - 1) < 0.05, `${value} is not level`);
});

test('the loudest bucket sets the scale, and the quieter ones keep their ratio', () => {
  // Second half at a quarter of the first half's amplitude.
  const peaks = peaksFromSamples(
    samplesOf(4000, (i) => (i < 2000 ? 0.4 : 0.1) * Math.sin(i / 10)),
    4
  );
  assert.ok(Math.abs(peaks[0] - 1) < 0.05);
  assert.ok(Math.abs(peaks[3] - 0.25) < 0.05);
});

test('every bar is inside the box it is drawn in', () => {
  const peaks = peaksFromSamples(samplesOf(4000, (i) => Math.sin(i) * 4), 32);
  for (const value of peaks) assert.ok(value >= 0 && value <= 1, `${value} is outside 0..1`);
});

test('a recording is read once however many rows mount it', async () => {
  forgetPeaks();
  let reads = 0;
  const read = async () => {
    reads++;
    return peaksFromSamples(samplesOf(400, () => 0.5), PEAK_BUCKETS);
  };

  const [first, second] = await Promise.all([peaksFor('a.webm', read), peaksFor('a.webm', read)]);
  const third = await peaksFor('a.webm', read);

  assert.equal(reads, 1);
  assert.equal(first, second);
  assert.equal(first, third);
});

test('two recordings are two answers', async () => {
  forgetPeaks();
  const read = async (value: number) => peaksFromSamples(samplesOf(400, () => value), PEAK_BUCKETS);
  await peaksFor('a.webm', () => read(0.5));
  await peaksFor('b.webm', () => read(0.25));
  const again = await peaksFor('a.webm', () => read(0.9));
  assert.deepEqual([...again], new Array(PEAK_BUCKETS).fill(1));
});

test('a recording with no name is computed and not remembered', async () => {
  forgetPeaks();
  let reads = 0;
  const read = async () => {
    reads++;
    return peaksFromSamples(samplesOf(400, () => 0.5), PEAK_BUCKETS);
  };
  await peaksFor(null, read);
  await peaksFor(null, read);
  assert.equal(reads, 2);
});

test('a read that fails is not cached as a failure', async () => {
  forgetPeaks();
  let reads = 0;
  const read = async () => {
    reads++;
    if (reads === 1) throw new Error('decode failed');
    return peaksFromSamples(samplesOf(400, () => 0.5), PEAK_BUCKETS);
  };

  assert.equal(await peaksFor('a.webm', read), null);
  const second = await peaksFor('a.webm', read);
  assert.equal(reads, 2);
  assert.ok(second);
});

/* The same bars, thinned to the width they are drawn at: a player inside the
   entry editor on a 320px screen has about 110px for its track, where 64
   bars would be under two pixels each. */

test('a narrow track draws fewer bars, each one the average of what it covers', () => {
  const peaks = Float32Array.from([1, 0, 0.5, 0.5, 0.25, 0.25, 1, 1]);
  assert.deepEqual([...barsAt(peaks, 4)], [0.5, 0.5, 0.25, 1]);
});

test('a track wide enough for every bar gets every bar, and nothing invented', () => {
  const peaks = Float32Array.from([1, 0, 0.5, 0.25]);
  assert.deepEqual([...barsAt(peaks, 4)], [1, 0, 0.5, 0.25]);
  assert.deepEqual([...barsAt(peaks, 40)], [1, 0, 0.5, 0.25]);
});

test('no track, no bars', () => {
  assert.equal(barsAt(Float32Array.from([1, 0]), 0).length, 0);
  assert.equal(barsAt(new Float32Array(0), 8).length, 0);
});

test('the bar count follows the width, between a floor and the buckets there are', () => {
  assert.equal(barCountFor(400), PEAK_BUCKETS);
  assert.equal(barCountFor(110), 27);
  // Even a track squeezed to nothing draws something rather than collapsing.
  assert.equal(barCountFor(8), 8);
  assert.equal(barCountFor(0), 8);
});
