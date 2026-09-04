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

   `names()` decompresses nothing regardless of the ceiling - its filter
   always returns false, which walks the central directory and stops
   there - so listing an archive's members is safe however large any one
   of them claims to be.

   `read` caches its result per name, and not only to avoid decompressing
   twice: a caller that reads the same member more than once - a preview
   sniffing a photo's bytes to pick its extension, then a commit reading
   the same photo again to write it - must not pay for it twice against
   the running total either, or the ceiling would refuse a backup for less
   than it actually holds. */

import { unzipSync } from 'fflate';

/** Refuses everything past a real ten-year export by design, not by guess -
    see `.scratch/pre-production-human-steps/05-zip-import-ceilings.md` for
    picking the real number from an actual export nobody has measured yet.
    The Daylio backup sheet's `dlb_too_large` string names this number in
    both languages - change one, change the other. */
export const ZIP_INFLATED_CEILING_BYTES = 512 * 1024 * 1024;

/** The picked file's own size on disk, checked before it is read into
    memory at all - a cheap, separate guard from the ceiling above, which
    only applies once a file is already a `Uint8Array` fflate can look
    inside. Smaller on purpose: a real export compresses, so a file already
    this size before unpacking has no legitimate way to land under the
    inflated ceiling once it does. Same human step as above, and the same
    "keep the copy in sync" note - `dlb_file_too_large` names this one. */
export const IMPORT_FILE_SIZE_CEILING_BYTES = 256 * 1024 * 1024;

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
  let total = 0;
  const cache = new Map<string, Uint8Array | null>();

  return {
    names(): string[] {
      const found: string[] = [];
      unzipSync(bytes, {
        filter: (entry) => {
          found.push(entry.name);
          return false;
        }
      });
      return found;
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
