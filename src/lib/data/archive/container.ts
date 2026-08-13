/* The archive container (ADR-0007, ticket 13): a plaintext header followed
   by the body encrypted as a sequence of AES-256-GCM chunks of roughly
   1 MB, each with its own nonce.

   The header is plaintext because F14 wants unknown and corrupt files
   rejected safely, and that is only possible if the format version and the
   key-derivation parameters can be read before any key is derived. Reading
   it costs nothing and reveals nothing an attacker could not work out from
   the file's length.

   Every chunk's AAD is the whole header followed by the chunk's index. The
   header carries the total chunk count, so binding it means truncating,
   reordering or re-labelling the file fails authentication instead of
   decrypting into a silently short archive - the worst possible outcome
   for a restore. It also covers the salt and the KDF parameters, which
   costs one concatenation and makes the whole plaintext prefix
   tamper-evident rather than just the parts that would have failed anyway.

   Nothing here knows what the body means; pack.ts owns that. Everything is
   an async iterable of byte pieces, so neither side ever holds more than a
   chunk plus whatever the caller is holding. */

import { decrypt, encrypt } from '../../crypto/aesGcm';
import type { Argon2Params } from '../../crypto/params';
import { currentArchiveFormatVersion } from './codec';
import { CorruptArchiveError, u32 } from './wire';

/** "GDIARY". Ahead of the version, so a file from a format that changes
    everything after byte 6 is still recognisably one of ours. */
const MAGIC = new Uint8Array([0x47, 0x44, 0x49, 0x41, 0x52, 0x59]);

/** magic, u16 format version, u32 header JSON length. */
const PREFIX_LENGTH = MAGIC.length + 2 + 4;

/** A header this long is not one of ours, whatever the magic says; the
    length is read off an untrusted file and allocated against. */
const MAX_HEADER_JSON = 64 * 1024;

const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;

export const ARCHIVE_FORMAT_VERSION = currentArchiveFormatVersion();

/** Roughly 1 MB (ADR-0007). Small enough that peak memory stays bounded on
    a phone, large enough that the 28 bytes of nonce and tag per chunk are
    noise. */
export const CHUNK_SIZE = 1024 * 1024;

export const ARCHIVE_FILE_EXTENSION = '.ttbackup';

/** The file is not something this build can read at all: not an archive,
    or an archive from a later format version. Distinct from a decryption
    failure because it is decided from the plaintext header, which anyone
    holding the file can read anyway - so saying so tells an attacker
    nothing and tells the user something useful. */
/** Which of the two refusals it was. The screen picks its wording from this
    rather than from the message: the message is a diagnostic and stays
    English for the console, while the sentence a person reads has to exist
    in both catalogues (docs/ui-copy.md). */
export type UnsupportedArchiveKind = 'not-an-archive' | 'newer-version';

export class UnsupportedArchiveError extends Error {
  readonly kind: UnsupportedArchiveKind;

  constructor(kind: UnsupportedArchiveKind, message: string) {
    super(message);
    this.name = 'UnsupportedArchiveError';
    this.kind = kind;
  }
}

export interface ArchiveHeader {
  formatVersion: number;
  kdf: Argon2Params;
  salt: Uint8Array<ArrayBuffer>;
  chunkSize: number;
  totalChunks: number;
}

/** Byte pieces held until enough have arrived to hand `n` of them over.
    Shared by the reader below and the re-chunker: both take a stream whose
    pieces are whatever size the source felt like and cut it at sizes of
    their own. */
class Buffered {
  #pieces: Uint8Array[] = [];
  length = 0;

  push(piece: Uint8Array): void {
    this.#pieces.push(piece);
    this.length += piece.length;
  }

  /** The first `n` bytes, as one array. `n` must not exceed `length`. */
  take(n: number): Uint8Array<ArrayBuffer> {
    const taken = new Uint8Array(n);
    let at = 0;
    while (at < n) {
      const piece = this.#pieces[0];
      const wanted = Math.min(piece.length, n - at);
      taken.set(piece.subarray(0, wanted), at);
      at += wanted;
      if (wanted === piece.length) this.#pieces.shift();
      else this.#pieces[0] = piece.subarray(wanted);
    }
    this.length -= n;
    return taken;
  }
}

export interface ByteReader {
  /** Exactly `n` bytes, or CorruptArchiveError if the stream ends first. */
  readExactly(n: number): Promise<Uint8Array<ArrayBuffer>>;
  /** Everything left. Only for the last chunk, whose length is whatever
      remains - it is the one read that is not bounded by the chunk size. */
  readRest(): Promise<Uint8Array<ArrayBuffer>>;
  /** True when the stream has no bytes left. Pulls from the source to find
      out, so it also runs whatever checks the source makes on its way to
      being exhausted. */
  atEnd(): Promise<boolean>;
}

export function byteReader(source: AsyncIterable<Uint8Array>): ByteReader {
  const iterator = source[Symbol.asyncIterator]();
  const buffered = new Buffered();
  let done = false;

  const pull = async (): Promise<boolean> => {
    if (done) return false;
    const next = await iterator.next();
    if (next.done) {
      done = true;
      return false;
    }
    buffered.push(next.value);
    return true;
  };

  return {
    async readExactly(n) {
      while (buffered.length < n) {
        if (!(await pull())) throw new CorruptArchiveError(`the file ends after ${buffered.length} of ${n} bytes`);
      }
      return buffered.take(n);
    },

    async readRest() {
      while (await pull());
      return buffered.take(buffered.length);
    },

    async atEnd() {
      while (buffered.length === 0 && (await pull()));
      return buffered.length === 0;
    }
  };
}

/** Everything an async iterable of byte pieces yields, as one array. The
    whole point of the format is not needing this, and the delivery path
    does not - it hands the pieces to a Blob one at a time. This is for the
    tests and the browser probe, which assert against whole archives. */
export async function collect(source: AsyncIterable<Uint8Array>): Promise<Uint8Array<ArrayBuffer>> {
  const buffered = new Buffered();
  for await (const piece of source) buffered.push(piece);
  return buffered.take(buffered.length);
}

/** How many chunks a body of `length` bytes takes. The count goes in the
    header, so the caller has to know the body's length before framing it. */
export function chunkCountFor(length: number, chunkSize: number): number {
  return Math.ceil(length / chunkSize);
}

function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function encodeHeader(header: ArchiveHeader): Uint8Array<ArrayBuffer> {
  const json = new TextEncoder().encode(
    JSON.stringify({
      kdf: header.kdf,
      salt: base64(header.salt),
      chunkSize: header.chunkSize,
      totalChunks: header.totalChunks
    })
  );
  const bytes = new Uint8Array(PREFIX_LENGTH + json.length);
  bytes.set(MAGIC, 0);
  const view = new DataView(bytes.buffer);
  view.setUint16(MAGIC.length, header.formatVersion);
  view.setUint32(MAGIC.length + 2, json.length);
  bytes.set(json, PREFIX_LENGTH);
  return bytes;
}

/** The plaintext header, and the exact bytes it was read from - the AAD is
    those bytes, so they cannot be re-encoded and have to be carried. */
export async function readArchiveHeader(
  reader: ByteReader
): Promise<{ header: ArchiveHeader; headerBytes: Uint8Array<ArrayBuffer> }> {
  const prefix = await reader.readExactly(PREFIX_LENGTH).catch(() => {
    throw new UnsupportedArchiveError('not-an-archive', 'this file is not a Gender Diary archive');
  });
  if (!MAGIC.every((byte, i) => prefix[i] === byte)) {
    throw new UnsupportedArchiveError('not-an-archive', 'this file is not a Gender Diary archive');
  }

  const view = new DataView(prefix.buffer, prefix.byteOffset);
  const formatVersion = view.getUint16(MAGIC.length);
  // Asymmetric on purpose (ADR-0007): a lower version is migrated after
  // the body is read, a higher one is refused here, before a key is
  // derived - this build cannot know what it would be agreeing to.
  if (formatVersion > ARCHIVE_FORMAT_VERSION) {
    throw new UnsupportedArchiveError('newer-version', 'this archive was made by a newer version of the app');
  }
  if (formatVersion < 1) throw new UnsupportedArchiveError('not-an-archive', 'this file is not a Gender Diary archive');

  const jsonLength = view.getUint32(MAGIC.length + 2);
  if (jsonLength > MAX_HEADER_JSON) throw new CorruptArchiveError('the archive header is not readable');
  const json = await reader.readExactly(jsonLength);

  const header = { formatVersion, ...parseHeaderJson(json) };
  return { header, headerBytes: concat(prefix, json) };
}

function parseHeaderJson(json: Uint8Array): Omit<ArchiveHeader, 'formatVersion'> {
  let parsed: { kdf?: Argon2Params; salt?: string; chunkSize?: number; totalChunks?: number };
  try {
    parsed = JSON.parse(new TextDecoder().decode(json));
  } catch {
    throw new CorruptArchiveError('the archive header is not readable');
  }

  const { kdf, salt, chunkSize, totalChunks } = parsed;
  const counts = [kdf?.memorySize, kdf?.iterations, kdf?.parallelism, kdf?.hashLength, chunkSize, totalChunks];
  // Checked here rather than left to the KDF and the chunk loop: these
  // numbers come off a file from anywhere, and they are allocated against.
  if (typeof salt !== 'string' || !counts.every((n) => Number.isInteger(n) && (n as number) > 0)) {
    throw new CorruptArchiveError('the archive header is not readable');
  }
  if (chunkSize! > CHUNK_SIZE * 16) throw new CorruptArchiveError('the archive header is not readable');

  return { kdf: kdf!, salt: fromBase64(salt), chunkSize: chunkSize!, totalChunks: totalChunks! };
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const both = new Uint8Array(a.length + b.length);
  both.set(a);
  both.set(b, a.length);
  return both;
}

function aadFor(headerBytes: Uint8Array, index: number): Uint8Array<ArrayBuffer> {
  return concat(headerBytes, u32(index));
}

export { CorruptArchiveError, u32 } from './wire';

/** Re-cuts a stream of arbitrary pieces into pieces of exactly `size`,
    plus whatever is left at the end. */
async function* rechunk(source: AsyncIterable<Uint8Array>, size: number): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  const buffered = new Buffered();
  for await (const piece of source) {
    buffered.push(piece);
    while (buffered.length >= size) yield buffered.take(size);
  }
  if (buffered.length > 0) yield buffered.take(buffered.length);
}

/** The whole archive: the header, then the body in framed chunks. The
    header has to be complete before the first chunk is encrypted, so the
    caller resolves the body's length first (chunkCountFor). A body that
    turns out to be a different length than that is refused rather than
    written - the alternative is an archive nothing can read back. */
export async function* frameArchive(
  key: Uint8Array<ArrayBuffer>,
  header: ArchiveHeader,
  body: AsyncIterable<Uint8Array>
): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  const headerBytes = encodeHeader(header);
  yield headerBytes;

  let index = 0;
  for await (const chunk of rechunk(body, header.chunkSize)) {
    if (index >= header.totalChunks) throw new Error('the archive body is longer than its header declares');
    const { nonce, ciphertext } = await encrypt(key, chunk, aadFor(headerBytes, index));
    yield concat(nonce, ciphertext);
    index += 1;
  }
  if (index !== header.totalChunks) throw new Error('the archive body is shorter than its header declares');
}

/** The decrypted body, chunk by chunk. Every chunk but the last is exactly
    `chunkSize` plaintext, so their framed lengths are known; the last one
    is whatever remains, which is what makes appended bytes fail its tag. */
export async function* unframeArchive(
  reader: ByteReader,
  header: ArchiveHeader,
  headerBytes: Uint8Array,
  key: Uint8Array<ArrayBuffer>
): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  for (let index = 0; index < header.totalChunks; index++) {
    const last = index === header.totalChunks - 1;
    const framed = last
      ? await reader.readRest()
      : await reader.readExactly(NONCE_LENGTH + header.chunkSize + TAG_LENGTH);
    if (framed.length <= NONCE_LENGTH + TAG_LENGTH) {
      throw new CorruptArchiveError(`the archive ends before chunk ${index + 1} of ${header.totalChunks}`);
    }
    yield decrypt(key, framed.subarray(0, NONCE_LENGTH), framed.subarray(NONCE_LENGTH), aadFor(headerBytes, index));
  }
}
