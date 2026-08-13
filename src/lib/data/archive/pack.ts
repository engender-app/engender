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
import { ARCHIVE_ARGON2_PARAMS, type Argon2Params } from '../../crypto/params';
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
}

export interface OpenedArchive {
  payload: ArchivePayload;
  /** The photo files, in the order the manifest names them, as the body
      reaches them. Consuming this to the end is what proves the archive
      was whole: the chunk count and the tags are only checked as the
      bytes go past. */
  files: AsyncGenerator<{ name: string; bytes: Uint8Array<ArrayBuffer> }>;
}

export async function* packArchive(
  contents: ArchiveContents,
  password: string,
  kdf: Argon2Params = ARCHIVE_ARGON2_PARAMS
): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  const encoded = await encodeArchive(contents);

  const salt = randomSalt();
  const key = await deriveKey(password, salt, kdf);

  yield* frameArchive(
    key,
    {
      formatVersion: encoded.formatVersion,
      kdf,
      salt,
      chunkSize: CHUNK_SIZE,
      totalChunks: chunkCountFor(encoded.bodyLength, CHUNK_SIZE)
    },
    encoded.body
  );
}

/** Reads an archive far enough to hand back its payload. The header is
    checked first, so an unknown format is refused before the password is
    put anywhere near a key derivation that takes a second. */
export async function openArchive(source: AsyncIterable<Uint8Array>, password: string): Promise<OpenedArchive> {
  const reader = byteReader(source);
  const { header, headerBytes } = await readArchiveHeader(reader);
  const key = await deriveKey(password, header.salt, header.kdf);
  const plaintext = byteReader(unframeArchive(reader, header, headerBytes, key));
  return decodeArchive(plaintext, header.formatVersion);
}
