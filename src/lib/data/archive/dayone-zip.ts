/* Reading a Day One export's zip container (phase 7 ticket 11): the
   central directory and, per entry, the bytes behind it.

   Deliberately narrow. Day One's own export is small - a JSON file and a
   handful of media - so this reads the classic (non-Zip64) format only and
   refuses cleanly rather than misreading a file large enough to need the
   64-bit extension. STORED and DEFLATE are the two methods a zip writer
   ever produces without being asked to; nothing else is decoded.

   DecompressionStream('deflate-raw') is a Web Streams API rather than a
   bundled inflate implementation, so this ships no compression library of
   its own - matching the app's usual reach for the platform over a
   dependency. It is a global in both the browser and Node 18+, so this
   file needs no browser/Node split the way photo normalization does. */

export class DayOneZipError extends Error {
  constructor(message: string) {
    super(`Day One export ${message}`);
    this.name = 'DayOneZipError';
  }
}

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const EOCD_FIXED_SIZE = 22;
/** A zip comment is at most 64KB, so the EOCD record is somewhere in the
    file's last (22 + 65535) bytes - never earlier, since nothing in the
    format lets the comment claim to be longer than it is. */
const MAX_COMMENT_SIZE = 65535;

function findEndOfCentralDirectory(view: DataView): number {
  const earliest = Math.max(0, view.byteLength - EOCD_FIXED_SIZE - MAX_COMMENT_SIZE);
  for (let offset = view.byteLength - EOCD_FIXED_SIZE; offset >= earliest; offset--) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  throw new DayOneZipError('is not a zip file (no end-of-central-directory record found)');
}

/** Every entry the central directory names, in the order it lists them.
    Reads sizes and the local header offset from the central directory
    rather than trusting a local header's own copies, which a streamed
    write can leave zeroed until a data descriptor after the compressed
    bytes fills them in. */
export function readZipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view);
  const entryCount = view.getUint16(eocd + 10, true);
  const centralDirOffset = view.getUint32(eocd + 16, true);
  if (entryCount === 0xffff || centralDirOffset === 0xffffffff) {
    throw new DayOneZipError('uses Zip64, which is not supported (unexpected for a Day One export)');
  }

  const entries: ZipEntry[] = [];
  let offset = centralDirOffset;
  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(offset, true) !== CENTRAL_DIR_SIGNATURE) {
      throw new DayOneZipError('has a damaged central directory');
    }
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** One entry's own bytes, decompressed if it needs to be. */
export async function extractZipEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = entry.localHeaderOffset;
  if (view.getUint32(offset, true) !== LOCAL_HEADER_SIGNATURE) {
    throw new DayOneZipError(`has a damaged local header for ${entry.name}`);
  }
  const nameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const dataStart = offset + 30 + nameLength + extraLength;
  const compressed = bytes.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.method === 0) return compressed;
  if (entry.method === 8) {
    const stream = new Blob([compressed as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  throw new DayOneZipError(`uses an unsupported compression method (${entry.method}) for ${entry.name}`);
}
