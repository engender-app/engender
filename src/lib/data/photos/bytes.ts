/* Detect HEIC from bytes before decoding so Chromium can give a useful
   message. Send other formats to the decoder. A filename or MIME label may
   be guessed or absent on picker input. */

const tagAt = (bytes: Uint8Array, at: number, text: string): boolean =>
  bytes.length >= at + text.length && [...text].every((c, i) => bytes[at + i] === c.charCodeAt(0));

/* ISO base media brands meaning "still image in HEIF". An MP4 shares the
   ftyp box, so the brand is what separates them - matching on ftyp alone
   would turn a video into a photo the user cannot see. */
const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'];

export function isHeic(bytes: Uint8Array): boolean {
  return tagAt(bytes, 4, 'ftyp') && HEIC_BRANDS.some((brand) => tagAt(bytes, 8, brand));
}
