import assert from 'node:assert/strict';
import { test } from 'vitest';
import { DecryptionFailedError } from '../../crypto/aesGcm.ts';
import { ARCHIVE_ARGON2_PARAMS } from '../../crypto/params.ts';
import {
  ARCHIVE_FORMAT_VERSION,
  CorruptArchiveError,
  UnsupportedArchiveError,
  byteReader,
  chunkCountFor,
  collect,
  frameArchive,
  readArchiveHeader,
  unframeArchive,
  type ArchiveHeader
} from './container.ts';

const key = () => crypto.getRandomValues(new Uint8Array(32));
const salt = () => crypto.getRandomValues(new Uint8Array(16));

/** A body of `length` bytes, delivered in pieces that do not line up with
    any chunk boundary - the framing has to be indifferent to how the
    source happens to hand its bytes over. */
async function* body(length: number, piece = 7000): AsyncGenerator<Uint8Array> {
  for (let at = 0; at < length; at += piece) {
    const size = Math.min(piece, length - at);
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) bytes[i] = (at + i) % 251;
    yield bytes;
  }
}

const expected = async (length: number) => collect(body(length));

function headerFor(length: number, chunkSize: number): ArchiveHeader {
  return {
    formatVersion: ARCHIVE_FORMAT_VERSION,
    kdf: ARCHIVE_ARGON2_PARAMS,
    salt: salt(),
    chunkSize,
    totalChunks: chunkCountFor(length, chunkSize)
  };
}

async function framed(length: number, chunkSize = 1024): Promise<{ k: Uint8Array<ArrayBuffer>; bytes: Uint8Array<ArrayBuffer> }> {
  const k = key();
  return { k, bytes: await collect(frameArchive(k, headerFor(length, chunkSize), body(length))) };
}

/** Reads an archive back the way the app does: header first, then the body. */
async function unframe(k: Uint8Array<ArrayBuffer>, bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const reader = byteReader(oneShot(bytes));
  const { header, headerBytes } = await readArchiveHeader(reader);
  return collect(unframeArchive(reader, header, headerBytes, k));
}

async function* oneShot(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  yield bytes;
}

test('round-trips a body that spans several chunks', async () => {
  const { k, bytes } = await framed(5000);
  assert.deepEqual(await unframe(k, bytes), await expected(5000));
});

test('round-trips a body shorter than one chunk', async () => {
  const { k, bytes } = await framed(10);
  assert.deepEqual(await unframe(k, bytes), await expected(10));
});

test('round-trips a body that is an exact multiple of the chunk size', async () => {
  const { k, bytes } = await framed(4096, 1024);
  assert.deepEqual(await unframe(k, bytes), await expected(4096));
});

test('the header is plaintext: magic, version, KDF parameters and salt read without a key', async () => {
  const k = key();
  const header = headerFor(5000, 1024);
  const bytes = await collect(frameArchive(k, header, body(5000)));

  assert.equal(new TextDecoder().decode(bytes.subarray(0, 6)), 'GDIARY');

  const { header: read } = await readArchiveHeader(byteReader(oneShot(bytes)));
  assert.equal(read.formatVersion, ARCHIVE_FORMAT_VERSION);
  assert.deepEqual(read.kdf, ARCHIVE_ARGON2_PARAMS);
  assert.deepEqual(read.salt, header.salt);
  assert.equal(read.chunkSize, 1024);
  assert.equal(read.totalChunks, 5);
});

test('every chunk gets its own nonce', async () => {
  const { bytes } = await framed(5000, 1024);
  const nonces = new Set<string>();
  let at = 12 + headerJsonLength(bytes);
  for (let i = 0; i < 5; i++) {
    nonces.add(String(bytes.subarray(at, at + 12)));
    at += 12 + 1024 + 16;
  }
  assert.equal(nonces.size, 5);
});

function headerJsonLength(bytes: Uint8Array): number {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint32(8);
}

test('a wrong password fails, and says only that', async () => {
  const { bytes } = await framed(5000);
  await assert.rejects(unframe(key(), bytes), DecryptionFailedError);
});

test('a file that is not an archive is refused before anything is decrypted', async () => {
  const notAnArchive = new TextEncoder().encode('PK this is a zip, actually, and quite a long one');
  await assert.rejects(unframe(key(), notAnArchive), UnsupportedArchiveError);
});

test('a file too short to hold a header is refused as not an archive', async () => {
  await assert.rejects(unframe(key(), new Uint8Array([1, 2, 3])), UnsupportedArchiveError);
});

test('a higher format version is refused, without deriving a key or decrypting', async () => {
  const { bytes } = await framed(5000);
  const newer = new Uint8Array(bytes);
  new DataView(newer.buffer).setUint16(6, ARCHIVE_FORMAT_VERSION + 1);

  await assert.rejects(
    readArchiveHeader(byteReader(oneShot(newer))),
    (error: Error) => error instanceof UnsupportedArchiveError && /newer version/.test(error.message)
  );
});

test('truncating the last chunk mid-way fails authentication', async () => {
  const { k, bytes } = await framed(5000, 1024);
  await assert.rejects(unframe(k, bytes.subarray(0, bytes.length - 200)), DecryptionFailedError);
});

test('dropping a whole chunk fails, rather than yielding a short body', async () => {
  const { k, bytes } = await framed(5000, 1024);
  // Exactly one framed chunk off the end: the bytes that remain are all
  // individually valid, so only the chunk count in the AAD catches this.
  const short = bytes.subarray(0, bytes.length - (12 + 1024 + 16));
  await assert.rejects(unframe(k, short), (error: Error) => error instanceof CorruptArchiveError || error instanceof DecryptionFailedError);
});

test('bytes appended to the end fail authentication', async () => {
  const { k, bytes } = await framed(5000, 1024);
  const longer = new Uint8Array(bytes.length + 32);
  longer.set(bytes);
  await assert.rejects(unframe(k, longer), DecryptionFailedError);
});

test('reordering two chunks fails authentication', async () => {
  const { k, bytes } = await framed(5000, 1024);
  const framedChunk = 12 + 1024 + 16;
  const start = 12 + headerJsonLength(bytes);
  const swapped = new Uint8Array(bytes);
  const first = bytes.subarray(start, start + framedChunk);
  const second = bytes.subarray(start + framedChunk, start + 2 * framedChunk);
  swapped.set(second, start);
  swapped.set(first, start + framedChunk);

  await assert.rejects(unframe(k, swapped), DecryptionFailedError);
});

test('editing the chunk count in the plaintext header fails authentication', async () => {
  const { k, bytes } = await framed(5000, 1024);
  const text = new TextDecoder().decode(bytes.subarray(12, 12 + headerJsonLength(bytes)));
  const tampered = new TextEncoder().encode(text.replace('"totalChunks":5', '"totalChunks":4'));
  assert.equal(tampered.length, headerJsonLength(bytes), 'the tampered header must be the same length');
  const edited = new Uint8Array(bytes);
  edited.set(tampered, 12);

  await assert.rejects(unframe(k, edited), DecryptionFailedError);
});

test('a body longer than the header declares is refused rather than written', async () => {
  const header = headerFor(1000, 1024);
  await assert.rejects(collect(frameArchive(key(), header, body(5000))), /longer than/);
});

test('a body shorter than the header declares is refused rather than written', async () => {
  const header = headerFor(5000, 1024);
  await assert.rejects(collect(frameArchive(key(), header, body(1000))), /shorter than/);
});
