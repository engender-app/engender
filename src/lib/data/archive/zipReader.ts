/* Read archive ZIP members within a shared memory budget. fflate's filter
   checks each declared size and the reader's running total before allocating.
   Opening scans names without decompressing and applies entry and name
   limits from daylioInputBudget.ts. Reject duplicate names up front.
   names() returns the scanned names. Cache each read by name so preview and
   commit share its bytes and budget charge. */

import { DAYLIO_BUDGET, ImportTooLargeError } from './daylioInputBudget';
import { FlateErrorCode, UnzipInflate, unzipSync, type UnzipOptions } from 'fflate';

/** Declared decompressed bytes across every read one reader does. The
    numbers behind this and every limit below are in daylioInputBudget.ts.
    Keep `dlb_too_large` in sync in both message catalogues. */
const ZIP_INFLATED_CEILING_BYTES = DAYLIO_BUDGET.zipInflatedBytes;

/** The picked file's own size on disk, checked before it is read into
    memory at all - a cheap, separate guard from the ceiling above, which
    only applies once a file is already a `Uint8Array` fflate can look
    inside. Keep `dlb_file_too_large` in sync in both message catalogues. */
export const IMPORT_FILE_SIZE_CEILING_BYTES = DAYLIO_BUDGET.backupFileBytes;

/** What a zip may hold, besides the running total of decompressed bytes. */
export interface ZipLimits {
  /** Declared size of any one member. */
  memberBytes: number;
  /** Entries in the central directory. */
  entries: number;
  /** Bytes in one entry name. */
  nameBytes: number;
  /** Bytes in every entry name together. */
  totalNameBytes: number;
}

const DEFAULT_LIMITS: ZipLimits = {
  memberBytes: DAYLIO_BUDGET.zipMemberBytes,
  entries: DAYLIO_BUDGET.zipEntries,
  nameBytes: DAYLIO_BUDGET.zipNameBytes,
  totalNameBytes: DAYLIO_BUDGET.zipTotalNameBytes
};

/** A zip refused for something it declares, before fflate allocated or
    this reader kept anything for it: a member or a running total of members
    past the byte ceiling, or a directory with too many or too long names. */
export class ZipTooLargeError extends ImportTooLargeError {
  constructor(limit: number, what: 'bytes' | 'entries' | 'name bytes' = 'bytes') {
    super(
      what === 'bytes'
        ? `declares more data, once decompressed, than the ${limit}-byte ceiling allows`
        : `holds more than ${limit} ${what}`
    );
    this.name = 'ZipTooLargeError';
  }
}

/** Invalid container bytes, distinct from allocation or caller failures. */
export class ZipFormatError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ZipFormatError';
  }
}

const FORMAT_CODES = new Set<number>([
  FlateErrorCode.UnexpectedEOF, FlateErrorCode.InvalidBlockType,
  FlateErrorCode.InvalidLengthLiteral, FlateErrorCode.InvalidDistance,
  FlateErrorCode.InvalidHeader, FlateErrorCode.InvalidUTF8,
  FlateErrorCode.InvalidZipData, FlateErrorCode.UnknownCompressionMethod
]);

function zipFailure(cause: unknown): never {
  if (cause instanceof Error && 'code' in cause && typeof cause.code === 'number' && FORMAT_CODES.has(cause.code)) {
    throw new ZipFormatError(cause.message, { cause });
  }
  throw cause;
}

function readZip(bytes: Uint8Array, options: UnzipOptions) {
  try {
    return unzipSync(bytes, options);
  } catch (cause) {
    zipFailure(cause);
  }
}

function requireRange(view: DataView, offset: number, length: number): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > view.byteLength) {
    throw new ZipFormatError('truncated ZIP structure');
  }
}

export interface ZipReader {
  /** Every entry name in the archive. Decompresses nothing. */
  names(): string[];
  /** One entry's bytes, or null when the archive has no such entry.
      Decompresses only that member, once - a second `read()` of the same
      name returns the cached result rather than decompressing again or
      billing the running total twice - and only once its declared size,
      added to every size this reader has newly accepted, still fits under
      the ceiling it was opened with - otherwise throws `ZipTooLargeError`
      rather than returning anything. */
  read(name: string, maxBytes?: number): Uint8Array | null;
  /** Uncached prefix, inflated in bounded chunks for attachment sniffing. */
  readPrefix(name: string, length: number): Uint8Array | null;
}

/** fflate owns names, sizes and decoding. Its filter does not expose local
    offsets, so walk the same central records once to retain member ranges.
    Data descriptors need no scan: the central record already has the size. */
function centralDirectory(view: DataView): { offset: number; zip64: boolean } {
  let end = view.byteLength - 22;
  while (end >= 0 && view.byteLength - end <= 65558) {
    if (view.getUint32(end, true) === 0x06054b50) {
      if (end >= 20 && view.getUint32(end - 20, true) === 0x07064b50) {
        const record = view.getUint32(end - 12, true);
        requireRange(view, record, 56);
        if (view.getUint32(record, true) === 0x06064b50) {
          return { offset: view.getUint32(record + 48, true), zip64: true };
        }
      }
      return { offset: view.getUint32(end + 16, true), zip64: false };
    }
    --end;
  }
  throw new ZipFormatError('invalid ZIP end record');
}

function localOffset(view: DataView, central: number, extraStart: number, extraEnd: number, zip64: boolean): number {
  const offset = view.getUint32(central + 42, true);
  if (offset !== 0xffffffff || !zip64) return offset;
  for (let at = extraStart; at + 4 < extraEnd; at += 4 + view.getUint16(at + 2, true)) {
    if (view.getUint16(at, true) !== 1) continue;
    const skippedSizes = Number(view.getUint32(central + 24, true) === 0xffffffff)
      + Number(view.getUint32(central + 20, true) === 0xffffffff);
    const position = at + 4 + 8 * skippedSizes;
    if (position + 8 > Math.min(extraEnd, at + 4 + view.getUint16(at + 2, true))) break;
    const value = view.getUint32(position, true) + view.getUint32(position + 4, true) * 0x100000000;
    if (!Number.isSafeInteger(value)) break;
    return value;
  }
  throw new ZipFormatError('invalid ZIP64 member offset');
}

/** A reader over one zip's bytes, bounding the total it will ever
    decompress across every `read()` call made on it. Open one per file
    being imported, not one per member - the running total is what catches
    many small members that individually look harmless. */
export function openZip(
  bytes: Uint8Array,
  ceilingBytes: number = ZIP_INFLATED_CEILING_BYTES,
  given: Partial<ZipLimits> = {}
): ZipReader {
  const limits = { ...DEFAULT_LIMITS, ...given };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const directory = centralDirectory(view);
  let central = directory.offset;
  const members = new Map<string, { offset: number; size: number; originalSize: number; compression: number }>();
  let nameBytes = 0;
  readZip(bytes, {
    filter: (entry) => {
      // Before anything is kept for this entry, so the collections below
      // never grow past what the limits allow.
      requireRange(view, central, 46);
      const nameLength = view.getUint16(central + 28, true);
      if (members.size >= limits.entries) throw new ZipTooLargeError(limits.entries, 'entries');
      if (nameLength > limits.nameBytes) throw new ZipTooLargeError(limits.nameBytes, 'name bytes');
      nameBytes += nameLength;
      if (nameBytes > limits.totalNameBytes) throw new ZipTooLargeError(limits.totalNameBytes, 'name bytes');
      if (members.has(entry.name)) throw new ZipFormatError('duplicate ZIP member name');
      if (view.getUint32(central, true) !== 0x02014b50) throw new ZipFormatError('invalid ZIP central record');
      const extraStart = central + 46 + view.getUint16(central + 28, true);
      const extraEnd = extraStart + view.getUint16(central + 30, true);
      const next = extraEnd + view.getUint16(central + 32, true);
      requireRange(view, central, next - central);
      members.set(entry.name, {
        offset: localOffset(view, central, extraStart, extraEnd, directory.zip64),
        size: entry.size,
        originalSize: entry.originalSize,
        compression: entry.compression
      });
      central = next;
      return false;
    }
  });

  let total = 0;
  const cache = new Map<string, Uint8Array | null>();
  const accepted = new Set<string>();
  function accept(name: string, maxBytes: number = limits.memberBytes): void {
    const member = members.get(name);
    if (!member) return;
    // On every call, not only the first: a member first accepted by a prefix
    // read must still meet the tighter limit a later full read names.
    const memberLimit = Math.min(maxBytes, limits.memberBytes);
    if (member.originalSize > memberLimit) throw new ZipTooLargeError(memberLimit);
    if (accepted.has(name)) return;
    const size = member.originalSize;
    if (total + size > ceilingBytes) throw new ZipTooLargeError(ceilingBytes);
    total += size;
    accepted.add(name);
  }

  return {
    names(): string[] {
      return [...members.keys()];
    },

    read(name: string, maxBytes?: number): Uint8Array | null {
      accept(name, maxBytes);
      if (cache.has(name)) return cache.get(name)!;
      const found = readZip(bytes, { filter: entry => entry.name === name });
      const value = Object.values(found)[0] ?? null;
      cache.set(name, value);
      return value;
    },

    readPrefix(name: string, length: number): Uint8Array | null {
      const member = members.get(name);
      if (!member) return null;
      accept(name);
      requireRange(view, member.offset, 30);
      if (view.getUint32(member.offset, true) !== 0x04034b50) throw new ZipFormatError('invalid ZIP local record');
      const start = member.offset + 30 + view.getUint16(member.offset + 26, true) + view.getUint16(member.offset + 28, true);
      const end = start + member.size;
      if (end > bytes.length || start > end) throw new ZipFormatError('truncated ZIP member');
      const prefix = new Uint8Array(Math.min(length, member.originalSize));
      if (member.compression === 0) {
        prefix.set(bytes.subarray(start, Math.min(end, start + prefix.length)));
        return prefix.subarray(0, Math.min(prefix.length, member.size));
      }
      if (member.compression !== 8) throw new ZipFormatError('unknown compression type ' + member.compression);
      let written = 0;
      let finished = prefix.length === 0;
      const stream = new UnzipInflate();
      stream.ondata = (error, chunk, final) => {
        if (error) zipFailure(error);
        const taking = Math.min(chunk.length, prefix.length - written);
        prefix.set(chunk.subarray(0, taking), written);
        written += taking;
        finished = written === prefix.length || final;
      };
      // At most 1024 compressed bytes reach the inflater per push.
      for (let at = start; at < end && !finished; at += 1024) {
        const next = Math.min(at + 1024, end);
        stream.push(bytes.subarray(at, next), next === end);
      }
      return prefix.subarray(0, written);
    }
  };
}
