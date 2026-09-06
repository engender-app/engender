/* Packing and unpacking an archive: the payload and the photo files on one
   side, the framed container (container.ts) on the other.

   The body is the payload as JSON behind its own length, then every photo
   file it names, back to back, in manifest order. Nothing is base64'd -
   the whole point of a binary container is that a photo can travel as
   bytes rather than as a third more bytes of text - and nothing describes
   a file twice: the manifest inside the JSON says how long each one is,
   which is also what settles the chunk count before the first chunk is
   encrypted (ADR-0007).

   Both directions are streams. Packing holds one photo and one chunk;
   unpacking hands photos over one at a time as the body reaches them, so
   ticket 14 can write each file as it arrives instead of holding a
   restored journal's worth of images in memory. */

import { deriveKey, randomSalt } from '../../crypto/argon2id';
import { resolveCredentialProfile } from '../../crypto/credential-consumers';
import type { Argon2Params } from '../../crypto/params';
import {
  ARCHIVE_FORMAT_VERSION,
  CHUNK_SIZE,
  byteReader,
  chunkCountFor,
  frameArchive,
  readArchiveHeader,
  unframeArchive,
} from './container';
import { decodeArchive, encodeArchive } from './codec';
import type { ArchiveFile, ArchiveJournal, ArchivePayload, PortablePreferences } from './payload';

/** What an export is made of: the journal's snapshot, the preferences that
    travel with it (ADR-0003), and a way to read one photo file at a time. */
export interface ArchiveContents {
  journal: ArchiveJournal;
  preferences: PortablePreferences;
  files: ArchiveFile[];
  readFile(name: string): Promise<Uint8Array>;
  /** Optional batched read. Results align with `names`; null means missing. */
  readFiles?(names: string[]): Promise<(Uint8Array | null)[]>;
}

export interface OpenedArchive {
  payload: ArchivePayload;
  /** The photo files, in the order the manifest names them, as the body
      reaches them. Consuming this to the end is what proves the archive
      was whole: the chunk count and the tags are only checked as the
      bytes go past. */
  files: AsyncGenerator<{ name: string; bytes: Uint8Array<ArrayBuffer> }>;
}

export type KeyDerivation = (
  salt: Uint8Array<ArrayBuffer>,
  kdf: Argon2Params
) => Promise<Uint8Array<ArrayBuffer>>;

/** Watching a pack that is already under way (phase 9 audit ticket 11,
    ADR-0070). Both halves are optional and neither changes what comes out:
    an export packed without them is byte for byte the one packed with. */
export interface PackWatch {
  /** Plaintext body bytes handed to the encryptor, against the body's
      whole length. The total is known before the first chunk, because it
      is what settles the chunk count (ADR-0007), and it never moves.

      Bytes rather than photos, because a journal whose photos are all
      thumbnails and one that is mostly full-size JPEG are the same number
      of photos and very different amounts of work - and because the
      payload's own JSON is real work too on a decade of entries. */
  onProgress?(done: number, total: number): void;
  /** Stops the pack. Safe at any point: an interrupted export has written
      nothing to the journal, so cancelling only means trying again
      (ADR-0070). The abort surfaces to the caller as an AbortError from
      whatever is draining the generator. */
  signal?: AbortSignal;
}

export async function* packArchive(
  contents: ArchiveContents,
  keyOrPassword: string | KeyDerivation,
  kdf: Argon2Params = resolveCredentialProfile('archive-export'),
  watch: PackWatch = {}
): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  watch.signal?.throwIfAborted();
  const encoded = await encodeArchive(contents);

  const salt = randomSalt();
  const key =
    typeof keyOrPassword === 'function'
      ? await keyOrPassword(salt, kdf)
      : await deriveKey(keyOrPassword, salt, kdf);

  yield* frameArchive(
    key,
    {
      formatVersion: encoded.formatVersion,
      kdf,
      salt,
      chunkSize: CHUNK_SIZE,
      totalChunks: chunkCountFor(encoded.bodyLength, CHUNK_SIZE)
    },
    watched(encoded.body, encoded.bodyLength, watch)
  );
}

/* Counted on the way in rather than on the way out: what comes out of
   frameArchive is ciphertext plus a header and a tag per chunk, so its
   lengths would report against a total the body's own length is not. The
   count leads the encryption by at most one chunk, which is the shape of
   every streamed progress report. */
async function* watched(
  body: AsyncGenerator<Uint8Array>,
  bodyLength: number,
  watch: PackWatch
): AsyncGenerator<Uint8Array> {
  let done = 0;
  watch.onProgress?.(0, bodyLength);
  for await (const piece of body) {
    watch.signal?.throwIfAborted();
    done += piece.length;
    watch.onProgress?.(done, bodyLength);
    yield piece;
  }
}

/** Reads an archive far enough to hand back its payload. The header is
    checked first, so an unknown format is refused before the password is
    put anywhere near a key derivation that takes a second. */
export async function openArchive(source: AsyncIterable<Uint8Array>, password: string): Promise<OpenedArchive> {
  const reader = byteReader(source);
  const { header, headerBytes } = await readArchiveHeader(reader);
  const key = await deriveKey(
    password,
    header.salt,
    resolveCredentialProfile('archive-import', { persistedParams: header.kdf })
  );
  const plaintext = byteReader(unframeArchive(reader, header, headerBytes, key));
  return decodeArchive(plaintext, header.formatVersion);
}
