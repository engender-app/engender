/* The one zip reader every archive importer uses (phase 8 audit ticket 11).

   fflate reads a member's declared uncompressed size out of the central
   directory and allocates the output buffer from that number before it
   decompresses a single byte (`new u8(su)` inside `unzipSync`). Nothing
   downstream of that line gets a say - the allocation already happened. So
   a real bomb is not required: a roughly 200-byte zip whose central
   directory claims 4 GiB asks for a 4 GiB array synchronously on the main
   thread, and a truncated or corrupted zip produces the same declared size
   by accident rather than by design.

   `read` below is the one place that decision is made, in the filter
   fflate itself calls before it allocates anything - `entry.originalSize`
   is checked, and the running total across every read this reader has done
   is checked with it, before the accept. A single member over the ceiling
   and several members that add up past it both fail here, for the same
   reason: it is the same number either way, the total this reader is about
   to hold in memory at once.

   Opening scans the central directory without decompressing anything.
   Duplicate names are rejected before any member can be read; otherwise
   two payloads could share one cache key and evade the running total.
   `names()` returns the scanned names, regardless of their declared sizes.

   `read` caches its result per name, and not only to avoid decompressing
   twice: a caller that reads the same member more than once - a preview
   sniffing a photo's bytes to pick its extension, then a commit reading
   the same photo again to write it - must not pay for it twice against
   the running total either, or the ceiling would refuse a backup for less
   than it actually holds. */

import { UnzipInflate, unzipSync } from 'fflate';

/** 1536 MiB allows headroom above the 851.2 MiB ten-year import estimate
    documented in ARCHITECTURE.md. This bounds allocations; it does
    not guarantee the device has enough memory for every accepted import.
    Keep `dlb_too_large` in sync in both message catalogues. */
const ZIP_INFLATED_CEILING_BYTES = 1536 * 1024 * 1024;

/** The picked file's own size on disk, checked before it is read into
    memory at all - a cheap, separate guard from the ceiling above, which
    only applies once a file is already a `Uint8Array` fflate can look
    inside. 1024 MiB admits the estimate even with little media compression,
    while keeping the input buffer below the decompression budget.
    Keep `dlb_file_too_large` in sync in both message catalogues. */
export const IMPORT_FILE_SIZE_CEILING_BYTES = 1024 * 1024 * 1024;

/** A zip refused a member, or a running total of members, past the ceiling
    it was opened with - before fflate allocated anything for it. */
export class ZipTooLargeError extends Error {
  constructor(ceilingBytes: number) {
    super(`declares more data, once decompressed, than the ${ceilingBytes}-byte ceiling allows`);
    this.name = 'ZipTooLargeError';
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
  read(name: string): Uint8Array | null;
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
        if (view.getUint32(record, true) === 0x06064b50) {
          return { offset: view.getUint32(record + 48, true), zip64: true };
        }
      }
      return { offset: view.getUint32(end + 16, true), zip64: false };
    }
    --end;
  }
  throw new Error('invalid ZIP end record');
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
  throw new Error('invalid ZIP64 member offset');
}

/** A reader over one zip's bytes, bounding the total it will ever
    decompress across every `read()` call made on it. Open one per file
    being imported, not one per member - the running total is what catches
    many small members that individually look harmless. */
export function openZip(bytes: Uint8Array, ceilingBytes: number = ZIP_INFLATED_CEILING_BYTES): ZipReader {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const directory = centralDirectory(view);
  let central = directory.offset;
  const members = new Map<string, { offset: number; size: number; originalSize: number; compression: number }>();
  unzipSync(bytes, {
    filter: (entry) => {
      if (members.has(entry.name)) throw new Error('duplicate ZIP member name');
      if (view.getUint32(central, true) !== 0x02014b50) throw new Error('invalid ZIP central record');
      const extraStart = central + 46 + view.getUint16(central + 28, true);
      const extraEnd = extraStart + view.getUint16(central + 30, true);
      members.set(entry.name, {
        offset: localOffset(view, central, extraStart, extraEnd, directory.zip64),
        size: entry.size,
        originalSize: entry.originalSize,
        compression: entry.compression
      });
      central = extraEnd + view.getUint16(central + 32, true);
      return false;
    }
  });

  let total = 0;
  const cache = new Map<string, Uint8Array | null>();
  const accepted = new Set<string>();
  function accept(name: string): void {
    const member = members.get(name);
    if (accepted.has(name) || !member) return;
    const size = member.originalSize;
    if (total + size > ceilingBytes) throw new ZipTooLargeError(ceilingBytes);
    total += size;
    accepted.add(name);
  }

  return {
    names(): string[] {
      return [...members.keys()];
    },

    read(name: string): Uint8Array | null {
      if (cache.has(name)) return cache.get(name)!;

      accept(name);
      const found = unzipSync(bytes, { filter: entry => entry.name === name });
      const value = Object.values(found)[0] ?? null;
      cache.set(name, value);
      return value;
    },

    readPrefix(name: string, length: number): Uint8Array | null {
      const member = members.get(name);
      if (!member) return null;
      accept(name);
      if (view.getUint32(member.offset, true) !== 0x04034b50) throw new Error('invalid ZIP local record');
      const start = member.offset + 30 + view.getUint16(member.offset + 26, true) + view.getUint16(member.offset + 28, true);
      const end = start + member.size;
      if (end > bytes.length || start > end) throw new Error('truncated ZIP member');
      const prefix = new Uint8Array(Math.min(length, member.originalSize));
      if (member.compression === 0) {
        prefix.set(bytes.subarray(start, Math.min(end, start + prefix.length)));
        return prefix.subarray(0, Math.min(prefix.length, member.size));
      }
      if (member.compression !== 8) throw new Error('unknown compression type ' + member.compression);
      let written = 0;
      let finished = prefix.length === 0;
      const stream = new UnzipInflate();
      stream.ondata = (error, chunk, final) => {
        if (error) throw error;
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
