/* Header-only image bytes for tests: just enough of a file for a reader of
   its declared size to find, and nothing a decoder could expand. */

const u32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n: number): number[] => [(n >>> 8) & 255, n & 255];

export function pngHeader(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...u32(13), 0x49, 0x48, 0x44, 0x52,
    ...u32(width), ...u32(height), 8, 6, 0, 0, 0,
    0, 0, 0, 0
  ]);
}

/** SOI, an optional APP1 of `exif` bytes the reader has to skip, then SOF0. */
export function jpegHeader(width: number, height: number, options: { exif?: number } = {}): Uint8Array {
  const app1 = options.exif ? [0xff, 0xe1, ...u16(options.exif + 2), ...new Array(options.exif).fill(0x45)] : [];
  return new Uint8Array([
    0xff, 0xd8, ...app1,
    0xff, 0xc0, ...u16(17), 8, ...u16(height), ...u16(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1
  ]);
}
