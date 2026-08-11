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
  CorruptArchiveError,
  byteReader,
  chunkCountFor,
  frameArchive,
  readArchiveHeader,
  u32,
  unframeArchive,
  type ByteReader
} from './container';
import { migratePayload, type ArchiveFile, type ArchiveJournal, type ArchivePayload, type PortablePreferences } from './payload';

const JSON_LENGTH_PREFIX = 4;

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
  const payload: ArchivePayload = {
    journal: contents.journal,
    preferences: contents.preferences,
    files: contents.files
  };
  const json = new TextEncoder().encode(JSON.stringify(payload));
  const length = JSON_LENGTH_PREFIX + json.length + contents.files.reduce((total, file) => total + file.length, 0);

  const salt = randomSalt();
  const key = await deriveKey(password, salt, kdf);

  yield* frameArchive(
    key,
    {
      formatVersion: ARCHIVE_FORMAT_VERSION,
      kdf,
      salt,
      chunkSize: CHUNK_SIZE,
      totalChunks: chunkCountFor(length, CHUNK_SIZE)
    },
    body(contents, json)
  );
}

async function* body(contents: ArchiveContents, json: Uint8Array): AsyncGenerator<Uint8Array> {
  yield u32(json.length);
  yield json;
  for (const file of contents.files) {
    const bytes = await contents.readFile(file.name);
    // The manifest is what the header's chunk count was worked out from,
    // so a file that has changed length since would push every later
    // chunk boundary along and produce an archive nothing can read.
    if (bytes.length !== file.length) {
      throw new Error(`${file.name} changed length while exporting: ${file.length} to ${bytes.length}`);
    }
    yield bytes;
  }
}

/** Reads an archive far enough to hand back its payload. The header is
    checked first, so an unknown format is refused before the password is
    put anywhere near a key derivation that takes a second. */
export async function openArchive(source: AsyncIterable<Uint8Array>, password: string): Promise<OpenedArchive> {
  const reader = byteReader(source);
  const { header, headerBytes } = await readArchiveHeader(reader);
  const key = await deriveKey(password, header.salt, header.kdf);
  const plaintext = byteReader(unframeArchive(reader, header, headerBytes, key));

  const jsonLength = new DataView((await plaintext.readExactly(JSON_LENGTH_PREFIX)).buffer).getUint32(0);
  const raw = parsePayload(await plaintext.readExactly(jsonLength));

  /* The manifest that cuts the body apart is the one the archive was
     written with, before any migration: the body's layout is part of the
     format version too, so a version that changes how files are laid out
     changes this function rather than adding a step to the ladder. */
  return { payload: migratePayload(raw, header.formatVersion), files: readFiles(plaintext, raw.files) };
}

function parsePayload(json: Uint8Array): ArchivePayload {
  let payload: ArchivePayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(json)) as ArchivePayload;
  } catch {
    throw new CorruptArchiveError('the archive contents are not readable');
  }
  // Only the manifest is checked here, and only as far as the body is cut
  // by it: these lengths are read off a file someone else wrote, and a
  // missing or negative one would be asked of the reader as a byte count.
  // What the rows themselves contain is ticket 14's to validate as it
  // writes them.
  const files = payload?.files;
  if (!payload?.journal || !Array.isArray(files) || !files.every((f) => typeof f?.name === 'string' && Number.isInteger(f?.length) && f.length >= 0)) {
    throw new CorruptArchiveError('the archive contents are not readable');
  }
  return payload;
}

async function* readFiles(plaintext: ByteReader, files: ArchiveFile[]) {
  for (const file of files) {
    yield { name: file.name, bytes: await plaintext.readExactly(file.length) };
  }
  // Draining the last chunk is what runs the chunk count and the final
  // tag check, so an archive is only known to be whole once its files
  // have all been handed over.
  if (!(await plaintext.atEnd())) throw new CorruptArchiveError('the archive holds more than it declares');
}
