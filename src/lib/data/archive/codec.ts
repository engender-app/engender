import {
  type ByteReader
} from './container';
import {
  PAYLOAD_MIGRATIONS,
  applyMigrations,
  type ArchiveFile,
  type ArchivePayload
} from './payload';
import type { ArchiveContents, OpenedArchive } from './pack';
import { CorruptArchiveError, u32 } from './wire';

const JSON_LENGTH_PREFIX = 4;

export interface EncodedArchiveBody {
  bodyLength: number;
  body: AsyncGenerator<Uint8Array>;
}

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

export const ARCHIVE_CODECS: readonly ArchiveCodec[] = [archiveCodecV1];

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
  for (const file of contents.files) {
    const bytes = Uint8Array.from(await contents.readFile(file.name));
    if (bytes.length !== file.length) {
      throw new Error(`${file.name} changed length while exporting: ${file.length} to ${bytes.length}`);
    }
    yield bytes;
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