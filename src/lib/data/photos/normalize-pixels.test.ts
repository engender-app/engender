import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { normalizePhotoPixels, UnsupportedImageError } from './normalize-pixels';
import { pngHeader, jpegHeader } from '../media/image-fixtures';

/* The decoder is the expensive part, so these tests stand in for it and
   assert whether it was reached at all: a refused image must never get as
   far as createImageBitmap (security-scan ticket 07, GD-028). */

const decoded = { width: 0, height: 0 };
const createImageBitmap = vi.fn();
const canvases: Array<{ width: number; height: number }> = [];

beforeEach(() => {
  canvases.length = 0;
  createImageBitmap.mockReset();
  createImageBitmap.mockImplementation(async () => ({ ...decoded, close: vi.fn() }));
  vi.stubGlobal('createImageBitmap', createImageBitmap);
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(
        public width: number,
        public height: number
      ) {
        canvases.push({ width, height });
      }
      getContext() {
        return { drawImage: vi.fn() };
      }
      async convertToBlob() {
        return new Blob([new Uint8Array([1, 2, 3])]);
      }
    }
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('normalizePhotoPixels decoded-size budget', () => {
  test('refuses a tiny PNG that declares over-budget dimensions without decoding it', async () => {
    const bytes = pngHeader(65535, 65535);
    expect(bytes.length).toBeLessThan(100);
    await expect(normalizePhotoPixels(bytes)).rejects.toMatchObject({
      name: 'UnsupportedImageError',
      kind: 'too-many-pixels'
    });
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  test('refuses a JPEG that declares over-budget dimensions without decoding it', async () => {
    const bytes = jpegHeader(30000, 30000);
    await expect(normalizePhotoPixels(bytes)).rejects.toBeInstanceOf(UnsupportedImageError);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  test('refuses a JPEG whose declared size sits behind an EXIF segment too', async () => {
    const bytes = jpegHeader(40000, 40000, { exif: 600 });
    await expect(normalizePhotoPixels(bytes)).rejects.toMatchObject({ kind: 'too-many-pixels' });
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  test('a 200 MP phone photo (16320x12240) is within budget and stores 2048px and 320px outputs', async () => {
    Object.assign(decoded, { width: 16320, height: 12240 });
    await normalizePhotoPixels(jpegHeader(16320, 12240));
    expect(createImageBitmap).toHaveBeenCalledTimes(1);
    expect(canvases).toEqual([
      { width: 2048, height: 1536 },
      { width: 320, height: 240 }
    ]);
  });

  test('the boundary image (the budget exactly) still decodes', async () => {
    Object.assign(decoded, { width: 16384, height: 16384 });
    await normalizePhotoPixels(pngHeader(16384, 16384));
    expect(canvases).toEqual([
      { width: 2048, height: 2048 },
      { width: 320, height: 320 }
    ]);
  });

  test('one pixel over the budget is refused', async () => {
    await expect(normalizePhotoPixels(pngHeader(16384, 16385))).rejects.toMatchObject({ kind: 'too-many-pixels' });
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  test('bytes with no readable image header are refused as unreadable, not decoded', async () => {
    await expect(normalizePhotoPixels(new Uint8Array([1, 2, 3, 4]))).rejects.toMatchObject({ kind: 'unreadable' });
    expect(createImageBitmap).not.toHaveBeenCalled();
  });
});
