/* Is this a HEIC?

   The one question worth asking about a picked file's bytes before trying
   to decode it. Chromium cannot decode HEIC at all, and HEIC is what an
   iPhone hands over by default, so it earns a message that says what to do
   instead of whatever createImageBitmap() throws for a format it does not
   know (ticket 11).

   Everything else is left to the decoder rather than checked against a
   list of formats. A whitelist here would reject AVIF, BMP and TIFF -
   which Chromium decodes perfectly well - and would have to be extended
   every time a picker learns a new format. A file that is not an image at
   all fails the decode and gets the same message either way.

   Read from the bytes, never the filename or the browser's declared MIME
   type: a file input reports whatever the OS guessed from the extension,
   and Android's photo picker hands over a content:// URI with none. */

const tagAt = (bytes: Uint8Array, at: number, text: string): boolean =>
  bytes.length >= at + text.length && [...text].every((c, i) => bytes[at + i] === c.charCodeAt(0));

/* ISO base media brands meaning "still image in HEIF". An MP4 shares the
   ftyp box, so the brand is what separates them - matching on ftyp alone
   would turn a video into a photo the user cannot see. */
const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'];

export function isHeic(bytes: Uint8Array): boolean {
  return tagAt(bytes, 4, 'ftyp') && HEIC_BRANDS.some((brand) => tagAt(bytes, 8, brand));
}
