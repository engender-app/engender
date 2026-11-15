/* The decoded-size budget for picked media (security-scan ticket 07).

   The ceilings that already existed count compressed file bytes, but what a
   file costs is what it becomes once decoded: a 60-byte PNG can declare
   65535 x 65535 pixels and ask for 16 GB of RGBA. So the image budget is read
   from the file's own header, before any decoder or canvas sees it.

   **Why 16384 x 16384.** 268 million pixels. The largest photo a phone
   produces today is a 200 MP sensor frame at 16320 x 12240 (199.8 MP), and
   a panorama stitched on a phone runs to about 100 MP, so the budget sits
   above everything a camera makes while still refusing a declared size no
   camera could have written. A user's real photo being refused is worse
   than the denial of service this guards against, so the number is set
   by the biggest real file, not by what is comfortable.

   Orientation does not change a pixel count, so the EXIF rotation that
   swaps width and height needs no handling here. */

/** 16384 x 16384. */
export const MAX_IMAGE_PIXELS = 16384 * 16384;

/** What a multi-pick may hand over in one go. A gallery pick on Android is
    capped at MediaStore.getPickImagesMaxLimit(), 100 on every device
    shipped so far, so 100 refuses nothing the picker itself would offer. */
export const MAX_PICK_COUNT = 100;
/** 1 GiB across the whole selection. Each file is read and normalized one
    at a time, so this bounds how long a selection can keep the app busy,
    not memory; 100 photos of 10 MB, a heavy phone, is under it. */
export const MAX_PICK_BYTES = 1024 * 1024 * 1024;

export type MediaBudgetKind = 'image-pixels' | 'audio-duration' | 'pick-selection';

/** A file or selection the app will not open, with the reason. The screen
    words its own message from `kind` (a Polish reader gets a Polish
    sentence); the message here is the English diagnostic. */
export class MediaBudgetError extends Error {
  readonly kind: MediaBudgetKind;

  constructor(kind: MediaBudgetKind, message: string) {
    super(message);
    this.name = 'MediaBudgetError';
    this.kind = kind;
  }
}

export interface ImageSize {
  width: number;
  height: number;
}

const u16be = (b: Uint8Array, at: number): number => (b[at] << 8) | b[at + 1];
const u32be = (b: Uint8Array, at: number): number => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
const u16le = (b: Uint8Array, at: number): number => b[at] | (b[at + 1] << 8);
const u24le = (b: Uint8Array, at: number): number => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16);
const i32le = (b: Uint8Array, at: number): number => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) | 0;

const tagAt = (b: Uint8Array, at: number, text: string): boolean =>
  b.length >= at + text.length && [...text].every((c, i) => b[at + i] === c.charCodeAt(0));

/** SOF markers carry the frame size; C4 (DHT), C8 (JPG) and CC (DAC) share
    the range and do not. */
const isSof = (marker: number): boolean => marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);

function jpegSize(b: Uint8Array): ImageSize | null {
  let at = 2;
  while (at + 4 <= b.length) {
    if (b[at] !== 0xff) return null;
    const marker = b[at + 1];
    if (marker === 0xff) {
      at += 1; // fill byte
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // end or scan data before any frame header
    if (isSof(marker)) {
      if (at + 9 > b.length) return null;
      return { height: u16be(b, at + 5), width: u16be(b, at + 7) };
    }
    at += 2 + u16be(b, at + 2);
  }
  return null;
}

function webpSize(b: Uint8Array): ImageSize | null {
  if (tagAt(b, 12, 'VP8X') && b.length >= 30) return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  if (tagAt(b, 12, 'VP8L') && b.length >= 25 && b[20] === 0x2f) {
    return {
      width: 1 + (b[21] | ((b[22] & 0x3f) << 8)),
      height: 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10))
    };
  }
  if (tagAt(b, 12, 'VP8 ') && b.length >= 30 && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
    return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  }
  return null;
}

/** AVIF and other HEIF stills declare their size in `ispe` property boxes.
    A grid image has one per tile and one for the whole, so the largest is
    the size a decoder will allocate. The search stops at 256 KiB: the
    properties sit in the `meta` box at the front. */
function isobmffSize(b: Uint8Array): ImageSize | null {
  const end = Math.min(b.length - 12, 256 * 1024);
  let best: ImageSize | null = null;
  for (let at = 4; at < end; at++) {
    if (b[at] === 0x69 && b[at + 1] === 0x73 && b[at + 2] === 0x70 && b[at + 3] === 0x65) {
      const width = u32be(b, at + 8);
      const height = u32be(b, at + 12);
      if (at + 16 <= b.length && width > 0 && height > 0 && (!best || width * height > best.width * best.height)) {
        best = { width, height };
      }
    }
  }
  return best;
}

/** The size a file's own header declares, or null when the format is not one
    this knows how to read. Never decodes anything. */
export function declaredImageSize(b: Uint8Array): ImageSize | null {
  let size: ImageSize | null = null;
  if (b.length >= 24 && tagAt(b, 1, 'PNG')) size = { width: u32be(b, 16), height: u32be(b, 20) };
  else if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) size = jpegSize(b);
  else if (b.length >= 10 && (tagAt(b, 0, 'GIF87a') || tagAt(b, 0, 'GIF89a'))) size = { width: u16le(b, 6), height: u16le(b, 8) };
  else if (b.length >= 12 && tagAt(b, 0, 'RIFF') && tagAt(b, 8, 'WEBP')) size = webpSize(b);
  else if (b.length >= 26 && tagAt(b, 0, 'BM')) {
    size =
      i32le(b, 14) === 12
        ? { width: u16le(b, 18), height: u16le(b, 20) }
        : { width: Math.abs(i32le(b, 18)), height: Math.abs(i32le(b, 22)) };
  } else if (b.length >= 12 && tagAt(b, 4, 'ftyp')) size = isobmffSize(b);
  else if (b.length >= 6 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) size = { width: 256, height: 256 }; // ICO caps each image at 256
  return size && size.width > 0 && size.height > 0 ? size : null;
}

export type ImageBudget = 'ok' | 'too-many-pixels' | 'unreadable';

/** Reads the header and judges it. 'unreadable' covers both a file that is
    not an image and a format whose header this cannot read: with no declared
    size there is nothing to hold the decoder to, so it is not run. */
export function judgeImage(bytes: Uint8Array): ImageBudget {
  const size = declaredImageSize(bytes);
  if (!size) return 'unreadable';
  return size.width * size.height > MAX_IMAGE_PIXELS ? 'too-many-pixels' : 'ok';
}

/** A selection judged by its declared sizes, before a single file is read. */
export function refuseSelectionOverBudget(sizes: readonly number[]): void {
  if (sizes.length > MAX_PICK_COUNT) {
    throw new MediaBudgetError('pick-selection', `Selected ${sizes.length} files; the limit is ${MAX_PICK_COUNT}`);
  }
  let total = 0;
  for (const size of sizes) total += size;
  if (total > MAX_PICK_BYTES) {
    throw new MediaBudgetError('pick-selection', `Selected files total ${total} bytes; the limit is ${MAX_PICK_BYTES}`);
  }
}
