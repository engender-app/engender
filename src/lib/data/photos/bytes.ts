/* What a picked file actually is, decided from its bytes.

   Neither half of the picker can be trusted to say: a file input reports
   whatever MIME type the OS guessed from the extension, and Android's
   photo picker hands over a content:// URI with no extension at all. So
   the format is read from the magic number, and HEIC - which Chromium
   cannot decode, and which is what an iPhone hands over by default - is
   turned away by name rather than left to fail as a mystery inside
   createImageBitmap() (ticket 11). */

export type ImageKind = 'jpeg' | 'png' | 'gif' | 'webp' | 'heic' | 'unknown';

const startsWith = (bytes: Uint8Array, prefix: number[], at = 0): boolean =>
  bytes.length >= at + prefix.length && prefix.every((b, i) => bytes[at + i] === b);

const tagAt = (bytes: Uint8Array, at: number, text: string): boolean =>
  startsWith(bytes, [...text].map((c) => c.charCodeAt(0)), at);

/* ISO base media brands that mean "still image in HEIF". An MP4 shares the
   ftyp box, so the brand is what separates them - matching on ftyp alone
   would turn a video into a photo the user cannot see. */
const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'];

export function sniffImageKind(bytes: Uint8Array): ImageKind {
  // SOI plus the first byte of the next marker: two bytes alone are as
  // likely to be the start of anything else.
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (tagAt(bytes, 0, 'GIF87a') || tagAt(bytes, 0, 'GIF89a')) return 'gif';
  if (tagAt(bytes, 0, 'RIFF') && tagAt(bytes, 8, 'WEBP')) return 'webp';
  if (tagAt(bytes, 4, 'ftyp') && HEIC_BRANDS.some((brand) => tagAt(bytes, 8, brand))) return 'heic';
  return 'unknown';
}
