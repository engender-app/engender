import assert from 'node:assert/strict';
import { test } from 'vitest';
import { demoAudioBytes, demoVideoBytes } from './demoAudioBytes.ts';

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function readWav(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));
  return {
    riff: ascii(0, 4),
    wave: ascii(8, 4),
    fmt: ascii(12, 4),
    sampleRate: view.getUint32(24, true),
    bitsPerSample: view.getUint16(34, true),
    dataChunk: ascii(36, 4),
    dataSize: view.getUint32(40, true)
  };
}

test('demoAudioBytes writes a WAV a browser can read a duration out of with no decode', () => {
  const bytes = demoAudioBytes(seeded(1));
  const header = readWav(bytes);

  assert.equal(header.riff, 'RIFF');
  assert.equal(header.wave, 'WAVE');
  assert.equal(header.fmt, 'fmt ');
  assert.equal(header.dataChunk, 'data');
  assert.equal(header.bitsPerSample, 16);
  assert.ok(header.sampleRate > 0);

  // The duration a player reads is sample count over sample rate - no
  // codec involved, so this is the same arithmetic a browser does.
  const sampleCount = header.dataSize / 2;
  const seconds = sampleCount / header.sampleRate;
  assert.ok(seconds > 0, 'the fixture must carry a positive duration');

  assert.equal(bytes.length, 44 + header.dataSize, 'the file is exactly its declared header plus its data');
});

test('demoAudioBytes is deterministic for a given random stream', () => {
  assert.deepEqual(demoAudioBytes(seeded(7)), demoAudioBytes(seeded(7)));
});

test('demoVideoBytes is demoAudioBytes, unchanged in shape (phase 11 ticket 14)', () => {
  assert.equal(demoVideoBytes, demoAudioBytes);
});
