import { afterEach, describe, expect, it, vi } from 'vitest';

import { frameBandDistances } from './frame-band-distances.mjs';

const WIDTH = 4;
const HEIGHT = 704;
const makePixels = (notice: number[], body: number[]) => {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const channels = x % 2 ? [255, 255, 255] : y < 200 ? notice : y < 700 ? body : [255, 255, 255];
      data.set([...channels, 255], (y * WIDTH + x) * 4);
    }
  }
  return data;
};

afterEach(() => vi.unstubAllGlobals());

describe('boot frame band distances', () => {
  it('keeps an empty capture empty', async () => {
    expect(await frameBandDistances([])).toEqual({ notice: [], body: [] });
  });

  it('preserves the original sampled columns, RGB channels and band boundaries', async () => {
    const pixels = [
      makePixels([0, 60, 120], [30, 60, 90]),
      makePixels([30, 60, 90], [0, 30, 60]),
      makePixels([60, 60, 60], [60, 90, 120])
    ];
    const reads: string[] = [];
    class Image {
      src = '';
      width = WIDTH;
      height = HEIGHT;
      async decode() {}
    }
    class Canvas {
      getContext() {
        let index = 0;
        return {
          drawImage(image: Image) { index = Number(image.src.split(',').at(-1)); },
          getImageData() {
            reads.push(`decode ${index}`);
            return {
              width: WIDTH, height: HEIGHT,
              get data() { reads.push(`read ${index}`); return pixels[index]; }
            };
          }
        };
      }
    }
    vi.stubGlobal('Image', Image);
    vi.stubGlobal('OffscreenCanvas', Canvas);

    expect(await frameBandDistances(pixels.map((_data, index) => ({ data: String(index) })))).toEqual({
      notice: [40, 20, 0], body: [30, 60, 0]
    });
    expect(reads.slice(0, reads.findIndex((entry) => entry.startsWith('read '))))
      .toHaveLength(2);
  });
});
