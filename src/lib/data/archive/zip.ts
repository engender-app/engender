/* Reading a zip, because a `.daylio` backup is one (phase 7 ticket 09).

   Only what that job needs: the entry names, and the bytes of an entry
   asked for by name. No writing, no streaming, no zip64, no encryption.
   The whole file is already in memory - it arrived as a picked file - so
   the reader indexes the central directory once and inflates an entry on
   demand, which keeps 84MB of photos out of memory a second time when a
   preview only wanted the JSON.

   The central directory is what it reads, rather than walking the local
   headers front to back. A local header may carry zeroed sizes with the
   real ones in a data descriptor after the data, so front-to-back needs
   the sizes it does not have yet; the directory always has them.

   Inflate comes from the platform: DecompressionStream('deflate-raw') is
   in every browser this app supports and in Node, so there is no
   dependency here and no inflate implementation to own.

   Names are normalised, not matched loosely. Daylio writes its asset
   entries with a leading slash ("/assets/photos/..."), so one entry would
   otherwise be reachable under two names or under neither, depending on
   which form the caller happened to hold. */

/** A zip this reader will not read, with the reason in the message. The
    Daylio source turns this into its own refusal ("not a zip") rather
    than letting it reach a screen. */
export class NotAZipError extends Error {
  constructor(message: string) {
    super(`zip ${message}`);
    this.name = 'NotAZipError';
  }
}

const LOCAL_HEADER = 0x04034b50;
const DIRECTORY_ENTRY = 0x02014b50;
const END_OF_DIRECTORY = 0x06054b50;
/** The end record plus the longest comment its own length field can
    describe, which is how far back it can sit from the end of the file. */
const MAX_END_SEARCH = 22 + 0xffff;

interface Located {
  /** Offset of the entry's local header, per the central directory. */
  headerAt: number;
  method: number;
  compressedLength: number;
}

export interface ZipArchive {
  /** Every entry name, normalised, in central-directory order. */
  names(): string[];
  /** The entry's bytes, or null when there is no such entry. Inflated on
      each call rather than cached: an asset is read once, and the caller
      already holds the whole file. */
  read(name: string): Promise<Uint8Array | null>;
}

export async function openZip(file: Uint8Array): Promise<ZipArchive> {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const end = findEnd(file, view);

  const count = view.getUint16(end + 10, true);
  const directoryAt = view.getUint32(end + 16, true);
  if (directoryAt + count * 46 > file.byteLength) {
    throw new NotAZipError('has a central directory that does not fit inside it');
  }

  const entries = new Map<string, Located>();
  let at = directoryAt;
  for (let index = 0; index < count; index++) {
    if (at + 46 > file.byteLength || view.getUint32(at, true) !== DIRECTORY_ENTRY) {
      throw new NotAZipError(`has a damaged central directory at entry ${index + 1}`);
    }
    const nameLength = view.getUint16(at + 28, true);
    const name = new TextDecoder().decode(file.subarray(at + 46, at + 46 + nameLength));
    // Written verbatim by the zipper, normalised here: see the header.
    entries.set(name.replace(/^\/+/, ''), {
      headerAt: view.getUint32(at + 42, true),
      method: view.getUint16(at + 10, true),
      compressedLength: view.getUint32(at + 20, true)
    });
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }

  return {
    names: () => [...entries.keys()],
    async read(name) {
      const found = entries.get(name);
      if (!found) return null;
      return readEntry(file, view, name, found);
    }
  };
}

/** The end-of-central-directory record, searched for from the back. Its
    own offset cannot be computed: a zip may carry a trailing comment of
    any length, and this record is what says how long everything else
    was. */
function findEnd(file: Uint8Array, view: DataView): number {
  const earliest = Math.max(0, file.byteLength - MAX_END_SEARCH);
  for (let at = file.byteLength - 22; at >= earliest; at--) {
    if (view.getUint32(at, true) === END_OF_DIRECTORY) return at;
  }
  throw new NotAZipError('has no end-of-central-directory record, so it is not a zip file');
}

async function readEntry(file: Uint8Array, view: DataView, name: string, found: Located): Promise<Uint8Array> {
  if (found.headerAt + 30 > file.byteLength || view.getUint32(found.headerAt, true) !== LOCAL_HEADER) {
    throw new NotAZipError(`entry ${name} is not where the central directory says it is`);
  }
  const dataAt =
    found.headerAt + 30 + view.getUint16(found.headerAt + 26, true) + view.getUint16(found.headerAt + 28, true);
  const dataEnd = dataAt + found.compressedLength;
  if (dataEnd > file.byteLength) throw new NotAZipError(`entry ${name} runs past the end of the file`);

  const stored = file.subarray(dataAt, dataEnd);
  if (found.method === 0) return stored;
  if (found.method !== 8) {
    throw new NotAZipError(`entry ${name} uses compression method ${found.method}, which this app cannot read`);
  }

  try {
    const inflated = new Blob([stored as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(inflated).arrayBuffer());
  } catch (cause) {
    throw new NotAZipError(`entry ${name} is compressed in a way that did not decompress`);
  }
}
