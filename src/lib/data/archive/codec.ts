import type { ByteReader } from './container';
import {
  PAYLOAD_MIGRATIONS,
  applyMigrations,
  type ArchiveFile,
  type ArchivePayload
} from './payload';
import type { ArchiveContents, OpenedArchive } from './pack';
import { CorruptArchiveError, u32 } from './wire';

const JSON_LENGTH_PREFIX = 4;

interface EncodedArchiveBody {
  bodyLength: number;
  body: AsyncGenerator<Uint8Array>;
}

/* ArchiveCodec stays exported only for its own test (AU-09 test-only review). */
export interface ArchiveCodec {
  formatVersion: number;
  encode(contents: ArchiveContents): Promise<EncodedArchiveBody>;
  decode(plaintext: ByteReader): Promise<OpenedArchive>;
}

const archiveCodecV1: ArchiveCodec = {
  formatVersion: 1,

  async encode(contents) {
    const payload: ArchivePayload = {
      journal: contents.journal,
      preferences: contents.preferences,
      files: contents.files
    };
    const json = Uint8Array.from(new TextEncoder().encode(JSON.stringify(payload)));
    const bodyLength = JSON_LENGTH_PREFIX + json.length + contents.files.reduce((total, file) => total + file.length, 0);

    return { bodyLength, body: encodeV1Body(contents, json) };
  },

  async decode(plaintext) {
    const jsonLength = new DataView((await plaintext.readExactly(JSON_LENGTH_PREFIX)).buffer).getUint32(0);
    const raw = parsePayload(await plaintext.readExactly(jsonLength));
    return { payload: raw, files: readFiles(plaintext, raw.files) };
  }
};

/* v2 changed what the payload's preferences hold, not how the body is laid
   out: phase 5 ticket 35 replaced the active preset with the list of scales
   it stood for, and PAYLOAD_MIGRATIONS carries a v1 file across. So this is
   v1's own encode and decode under a second version number rather than a
   second implementation - the format version is one number shared by the
   body layout and the payload's shape, and only the second one moved.

   Written as a spread rather than by mutating v1's number, because a v1 file
   still has to decode as v1 before the ladder walks it. */
const archiveCodecV2: ArchiveCodec = { ...archiveCodecV1, formatVersion: 2 };

const ARCHIVE_CODECS: readonly ArchiveCodec[] = [archiveCodecV1, archiveCodecV2];

export const ARCHIVE_FORMAT_VERSION = currentArchiveFormatVersion();

export function currentArchiveFormatVersion(codecs: readonly ArchiveCodec[] = ARCHIVE_CODECS): number {
  const current = codecs[codecs.length - 1];
  if (!current) throw new Error('no archive codecs are registered');
  return current.formatVersion;
}

function codecForVersion(formatVersion: number, codecs: readonly ArchiveCodec[]): ArchiveCodec {
  const codec = codecs.find((candidate) => candidate.formatVersion === formatVersion);
  if (!codec) throw new Error(`unsupported archive format version ${formatVersion}`);
  return codec;
}

export async function encodeArchive(
  contents: ArchiveContents,
  codecs: readonly ArchiveCodec[] = ARCHIVE_CODECS
): Promise<{ formatVersion: number; bodyLength: number; body: AsyncGenerator<Uint8Array> }> {
  const codec = codecForVersion(currentArchiveFormatVersion(codecs), codecs);
  const encoded = await codec.encode(contents);
  return { formatVersion: codec.formatVersion, ...encoded };
}

export async function decodeArchive(
  plaintext: ByteReader,
  formatVersion: number,
  codecs: readonly ArchiveCodec[] = ARCHIVE_CODECS,
  migrations = PAYLOAD_MIGRATIONS
): Promise<OpenedArchive> {
  const codec = codecForVersion(formatVersion, codecs);
  const decoded = await codec.decode(plaintext);
  return {
    payload: applyMigrations(decoded.payload, formatVersion, currentArchiveFormatVersion(codecs), migrations),
    files: decoded.files
  };
}

async function* encodeV1Body(contents: ArchiveContents, json: Uint8Array): AsyncGenerator<Uint8Array> {
  yield u32(json.length);
  yield json;
  if (!contents.readFiles) {
    for (const file of contents.files) {
      const bytes = Uint8Array.from(await contents.readFile(file.name));
      if (bytes.length !== file.length) {
        throw new Error(`${file.name} changed length while exporting: ${file.length} to ${bytes.length}`);
      }
      yield bytes;
    }
    return;
  }

  const BATCH_SIZE = 16;
  // Two ordinary batches share 8 MiB. Larger files travel alone.
  const PREFETCH_BYTES = 8 * 1024 * 1024;
  const BATCH_BYTES = PREFETCH_BYTES / 2;
  const batches: (typeof contents.files)[] = [];
  for (let i = 0; i < contents.files.length;) {
    const batch: typeof contents.files = [];
    let length = 0;
    do {
      const file = contents.files[i];
      if (batch.length && length + file.length > BATCH_BYTES) break;
      batch.push(file);
      length += file.length;
      i++;
    } while (i < contents.files.length && batch.length < BATCH_SIZE && length < BATCH_BYTES);
    batches.push(batch);
  }
  const readBatch = (batch: typeof contents.files) =>
    contents.readFiles!(batch.map((file) => file.name));

  let pending: ReturnType<typeof readBatch> | undefined;
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const read = await (pending ?? readBatch(batch));
    pending = undefined;
    if (read.length !== batch.length) {
      throw new Error(`batched archive read returned ${read.length} files for ${batch.length} requested`);
    }
    const nextBatch = batches[i + 1];
    if (nextBatch && batch[0].length <= BATCH_BYTES && nextBatch[0].length <= BATCH_BYTES) {
      pending = readBatch(nextBatch);
      // A prefetched failure is rethrown on consumption, even if it settles during a yield.
      void pending.catch(() => {});
    }

    for (let j = 0; j < batch.length; j++) {
      const file = batch[j];
      const bytes = read[j];
      if (bytes === null) {
        throw new Error(`photo file missing while exporting: ${file.name}`);
      }
      if (bytes.length !== file.length) {
        throw new Error(`${file.name} changed length while exporting: ${file.length} to ${bytes.length}`);
      }
      yield bytes;
      read[j] = null;
    }
  }
}

function parsePayload(json: Uint8Array): ArchivePayload {
  let payload: ArchivePayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(json)) as ArchivePayload;
  } catch {
    throw new CorruptArchiveError('the archive contents are not readable');
  }
  const files = payload?.files;
  if (!payload?.journal || !Array.isArray(files) || !files.every((file) => typeof file?.name === 'string' && Number.isInteger(file?.length) && file.length >= 0)) {
    throw new CorruptArchiveError('the archive contents are not readable');
  }
  return payload;
}

async function* readFiles(plaintext: ByteReader, files: ArchiveFile[]) {
  for (const file of files) {
    yield { name: file.name, bytes: await plaintext.readExactly(file.length) };
  }
  if (!(await plaintext.atEnd())) throw new CorruptArchiveError('the archive holds more than it declares');
}
