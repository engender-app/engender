import { describe, expect, test } from 'vitest';
import { declaredImageSize, judgeImage, MAX_PICK_BYTES, MAX_PICK_COUNT, MediaBudgetError, refuseSelectionOverBudget } from './budget';
import { jpegHeader, pngHeader } from './image-fixtures';

const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
const le32 = (n: number): number[] => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
const be32 = (n: number): number[] => [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];

describe('declaredImageSize', () => {
  test('reads PNG and JPEG', () => {
    expect(declaredImageSize(pngHeader(640, 480))).toEqual({ width: 640, height: 480 });
    expect(declaredImageSize(jpegHeader(4032, 3024, { exif: 60000 }))).toEqual({ width: 4032, height: 3024 });
  });

  test('reads GIF', () => {
    const gif = new Uint8Array([...ascii('GIF89a'), 0x40, 0x01, 0xf0, 0x00, 0, 0, 0]);
    expect(declaredImageSize(gif)).toEqual({ width: 320, height: 240 });
  });

  test('reads the three WebP flavours', () => {
    const riff = (chunk: number[]) => new Uint8Array([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'), ...chunk]);
    const vp8x = riff([...ascii('VP8X'), 10, 0, 0, 0, 0, 0, 0, 0, 0x3f, 0x01, 0x00, 0xef, 0x00, 0x00]);
    expect(declaredImageSize(vp8x)).toEqual({ width: 320, height: 240 });
    // VP8L: width-1 = 319 (14 bits), height-1 = 239 (14 bits)
    const w = 319;
    const h = 239;
    const vp8l = riff([...ascii('VP8L'), 5, 0, 0, 0, 0x2f, w & 255, ((w >> 8) & 0x3f) | ((h & 3) << 6), (h >> 2) & 255, (h >> 10) & 15]);
    expect(declaredImageSize(vp8l)).toEqual({ width: 320, height: 240 });
    const vp8 = riff([...ascii('VP8 '), 10, 0, 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a, 0x40, 0x01, 0xf0, 0x00]);
    expect(declaredImageSize(vp8)).toEqual({ width: 320, height: 240 });
  });

  test('reads BMP', () => {
    const bmp = new Uint8Array(30);
    bmp.set(ascii('BM'));
    bmp.set(le32(40), 14);
    bmp.set(le32(100), 18);
    bmp.set(le32(-50), 22);
    expect(declaredImageSize(bmp)).toEqual({ width: 100, height: 50 });
  });

  test('reads the largest ispe of an AVIF, which is the whole image rather than a tile', () => {
    const ispe = (w: number, h: number) => [...ascii('ispe'), 0, 0, 0, 0, ...be32(w), ...be32(h)];
    const avif = new Uint8Array([0, 0, 0, 16, ...ascii('ftypavif'), 0, 0, 0, 0, ...ispe(512, 512), ...ispe(4096, 3072)]);
    expect(declaredImageSize(avif)).toEqual({ width: 4096, height: 3072 });
  });

  test('is null for what it cannot read', () => {
    expect(declaredImageSize(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(declaredImageSize(new Uint8Array(0))).toBeNull();
    expect(declaredImageSize(jpegHeader(0, 0))).toBeNull();
    // A truncated JPEG: SOI and a segment that claims more than the file holds.
    expect(declaredImageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1]))).toBeNull();
  });
});

describe('judgeImage', () => {
  test('a 200 MP phone photo passes, a 65535 square does not', () => {
    expect(judgeImage(jpegHeader(16320, 12240))).toBe('ok');
    expect(judgeImage(pngHeader(65535, 65535))).toBe('too-many-pixels');
    expect(judgeImage(new Uint8Array([9, 9, 9]))).toBe('unreadable');
  });
});

describe('refuseSelectionOverBudget', () => {
  test('passes the largest real selection, refuses one count or one byte over', () => {
    expect(() => refuseSelectionOverBudget(new Array(MAX_PICK_COUNT).fill(1024))).not.toThrow();
    expect(() => refuseSelectionOverBudget(new Array(MAX_PICK_COUNT + 1).fill(1))).toThrow(MediaBudgetError);
    expect(() => refuseSelectionOverBudget([MAX_PICK_BYTES])).not.toThrow();
    expect(() => refuseSelectionOverBudget([MAX_PICK_BYTES, 1])).toThrow(MediaBudgetError);
  });
});
