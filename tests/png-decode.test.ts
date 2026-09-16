// @ts-nocheck
/* The device sweep's PNG decoder, on fixtures built byte-by-byte rather
   than read from disk: what needs proving is the unfilter arithmetic, and
   a hand-assembled image can say exactly what each filter byte must
   produce. CRCs are zeroed - the decoder does not verify them, by its own
   header's argument. */
import { deflateSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { decodePng, grayFrame } from './png-decode.mjs';

const chunk = (type, data) => {
  const out = new Uint8Array(12 + data.length);
  new DataView(out.buffer).setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  return out;
};

const ihdr = (width, height, colorType) => {
  const d = new Uint8Array(13);
  const v = new DataView(d.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  d[8] = 8; // bit depth
  d[9] = colorType;
  return d;
};

/** One image, `rows` each already carrying a leading filter byte. */
const png = (width, height, colorType, rows, extra = []) => {
  const raw = new Uint8Array(rows.flatMap((r) => [r.filter, ...r.bytes]));
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr(width, height, colorType)),
    ...extra,
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array())
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

describe('decodePng', () => {
  it('reads an unfiltered truecolor image', () => {
    const image = png(2, 1, 2, [
      { filter: 0, bytes: [255, 0, 0, 0, 255, 0] }
    ]);
    const { width, height, channels, pixels } = decodePng(image);
    expect([width, height, channels]).toEqual([2, 1, 3]);
    expect([...pixels]).toEqual([255, 0, 0, 0, 255, 0]);
  });

  it('reads RGBA, and grayFrame takes the luma of each pixel', () => {
    const image = png(1, 1, 6, [{ filter: 0, bytes: [255, 255, 0, 255] }]);
    const decoded = decodePng(image);
    expect(decoded.channels).toBe(4);
    expect(grayFrame(decoded)[0]).toBe(Math.round(0.299 * 255 + 0.587 * 255));
  });

  it('unfilters sub rows against the decoded left neighbour', () => {
    /* Two samples, bpp 1: the second is stored relative to the first. */
    const image = png(2, 1, 0, [{ filter: 1, bytes: [5, 15] }]);
    expect([...decodePng(image).pixels]).toEqual([5, 20]);
  });

  it('unfilters up rows against the row above', () => {
    const image = png(1, 2, 0, [
      { filter: 0, bytes: [10] },
      { filter: 2, bytes: [15] }
    ]);
    expect([...decodePng(image).pixels]).toEqual([10, 25]);
  });

  it('unfilters average rows', () => {
    const image = png(1, 2, 0, [
      { filter: 0, bytes: [4] },
      /* x=0: left 0, up 4 -> average 2 -> 10 + 2. */
      { filter: 3, bytes: [10] }
    ]);
    expect([...decodePng(image).pixels]).toEqual([4, 12]);
  });

  it('unfilters paeth rows', () => {
    const image = png(1, 2, 0, [
      { filter: 0, bytes: [9] },
      /* x=0: predictors 0/9/0 -> picks up (9) -> 9 + 9. */
      { filter: 4, bytes: [9] }
    ]);
    expect([...decodePng(image).pixels]).toEqual([9, 18]);
  });

  it('resolves palette indices through PLTE', () => {
    const plte = chunk('PLTE', new Uint8Array([10, 20, 30, 200, 210, 220]));
    const image = png(2, 1, 3, [{ filter: 0, bytes: [0, 1] }], [plte]);
    const decoded = decodePng(image);
    expect(decoded.channels).toBe(1);
    expect(grayFrame(decoded)).toEqual(
      new Uint8Array([Math.round(0.299 * 10 + 0.587 * 20 + 0.114 * 30), Math.round(0.299 * 200 + 0.587 * 210 + 0.114 * 220)])
    );
  });

  it('refuses what it does not implement, by name', () => {
    const d = ihdr(1, 1, 2);
    d[8] = 16; // bit depth
    const bad = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...chunk('IHDR', d)]);
    expect(() => decodePng(bad)).toThrow(/bit depth 16/);
  });
});
