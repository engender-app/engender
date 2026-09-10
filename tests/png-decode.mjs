// @ts-nocheck
/* A PNG decoder for the device yank sweep (ticket 100) - enough of one to
   read what Chrome's Page.screencastFrame hands back, and no more.

   The repo already depends on fflate for inflate; a PNG is chunk walking,
   one inflate and a per-row unfilter, so a hundred lines here beat a new
   dependency for a test script. CRCs are not verified: screencast frames
   travel over a local websocket, not a storage medium, and a wrong frame
   shows up as a wrong diff rather than as silent corruption.

   Supports what Chrome writes for screenshots: 8-bit truecolor with or
   without alpha, plus grayscale, grayscale+alpha and palette so a fixture
   in the unit test can exercise every unfilter path. No interlacing -
   throw on it rather than half-read an image nobody will send. */
import { inflateSync, unzlibSync } from 'fflate';

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
/** Color type -> samples per pixel. Palette entries are an index that
 *  resolves through PLTE, still one sample wide on the wire. */
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * Decode a PNG into `{ width, height, channels, pixels, palette }`.
 * `pixels` is the unfiltered, packed sample array - `width * height *
 * channels` bytes - and `palette`, for a palette image, holds one
 * `[r, g, b]` per index.
 */
export function decodePng(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  for (let i = 0; i < SIGNATURE.length; i++)
    if (bytes[i] !== SIGNATURE[i]) throw new Error('not a PNG: bad signature');

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = 0;
  let palette = null;
  const idat = [];

  let at = SIGNATURE.length;
  while (at + 8 <= bytes.length) {
    const length = viewUint32(bytes, at);
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
    const data = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = viewUint32(data, 0);
      height = viewUint32(data, 4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') {
      palette = Array.from({ length: data.length / 3 }, (_, i) => [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]]);
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    at += 12 + length;
  }

  if (bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${bitDepth}`);
  if (!(colorType in CHANNELS)) throw new Error(`unsupported PNG color type ${colorType}`);
  if (interlace) throw new Error('interlaced PNG not supported');
  if (colorType === 3 && !palette) throw new Error('palette PNG without a PLTE chunk');

  const channels = CHANNELS[colorType];
  const stride = width * channels;
  const compressed = concat(idat);
  let filtered;
  try {
    filtered = unzlibSync(compressed);
  } catch {
    filtered = inflateSync(compressed);
  }
  if (filtered.length < height * (stride + 1))
    throw new Error(`PNG truncated: ${filtered.length} bytes for ${height} rows of ${stride}`);

  const pixels = new Uint8Array(height * stride);
  const bpp = channels; // every supported type is 8-bit, so bytes == samples
  for (let y = 0; y < height; y++) {
    const filter = filtered[y * (stride + 1)];
    const row = filtered.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = y * stride;
    const prior = out - stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= bpp ? pixels[out + x - bpp] : 0;
      const up = y > 0 ? pixels[prior + x] : 0;
      const upLeft = y > 0 && x >= bpp ? pixels[prior + x - bpp] : 0;
      let value = row[x];
      switch (filter) {
        case 0:
          break;
        case 1:
          value += left;
          break;
        case 2:
          value += up;
          break;
        case 3:
          value += (left + up) >> 1;
          break;
        case 4:
          value += paeth(left, up, upLeft);
          break;
        default:
          throw new Error(`unknown PNG row filter ${filter}`);
      }
      pixels[out + x] = value & 0xff;
    }
  }

  return { width, height, channels, pixels, palette };
}

/** Luma of a decoded frame, one byte per pixel - what a diff reads, since
 *  a yank is about content moving, not about hue. Palette indices resolve
 *  through the palette; alpha is ignored (screencast frames are opaque). */
export function grayFrame(png) {
  const { width, height, channels, pixels, palette } = png;
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const p = i * channels;
    switch (channels) {
      case 1:
        gray[i] = palette ? luma(palette[pixels[p]][0], palette[pixels[p]][1], palette[pixels[p]][2]) : pixels[p];
        break;
      case 2:
        gray[i] = pixels[p];
        break;
      default:
        gray[i] = luma(pixels[p], pixels[p + 1], pixels[p + 2]);
    }
  }
  return gray;
}

const luma = (r, g, b) => Math.round(0.299 * r + 0.587 * g + 0.114 * b);

/** The predictor PNG's filter 4 is defined on, verbatim from the spec. */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

const viewUint32 = (data, at) =>
  data instanceof Uint8Array
    ? new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(at)
    : data.getUint32(at);

function concat(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
