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

import { unzipSync } from 'fflate';

/** 1536 MiB allows headroom above the 851.2 MiB ten-year import estimate
    documented in docs/architecture.md. This bounds allocations; it does
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
}

/** A reader over one zip's bytes, bounding the total it will ever
    decompress across every `read()` call made on it. Open one per file
    being imported, not one per member - the running total is what catches
    many small members that individually look harmless. */
export function openZip(bytes: Uint8Array, ceilingBytes: number = ZIP_INFLATED_CEILING_BYTES): ZipReader {
  const names = new Set<string>();
  unzipSync(bytes, {
    filter: (entry) => {
      if (names.has(entry.name)) throw new Error('duplicate ZIP member name');
      names.add(entry.name);
      return false;
    }
  });

  let total = 0;
  const cache = new Map<string, Uint8Array | null>();

  return {
    names(): string[] {
      return [...names];
    },

    read(name: string): Uint8Array | null {
      if (cache.has(name)) return cache.get(name)!;

      let refused = false;
      let acceptedSize = 0;
      const found = unzipSync(bytes, {
        filter: (entry) => {
          if (entry.name !== name) return false;
          if (total + entry.originalSize > ceilingBytes) {
            refused = true;
            return false;
          }
          acceptedSize = entry.originalSize;
          return true;
        }
      });
      if (refused) throw new ZipTooLargeError(ceilingBytes);
      total += acceptedSize;
      const value = Object.values(found)[0] ?? null;
      cache.set(name, value);
      return value;
    }
  };
}
