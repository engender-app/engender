import type { NormalizedPhoto } from '../../src/lib/data/journal/photos';
const FULL = { width: 2048, height: 1536 };
const THUMB = { width: 320, height: 240 };

/* A 256x256 tile of deterministic noise, drawn once and tiled over every
   photo, so the fixture cannot compress to nothing. Same algorithm as the
   web probe so the two benchmarks use photos of the same size on disk. */
function noiseTile(): OffscreenCanvas {
  const tile = new OffscreenCanvas(256, 256);
  const context = tile.getContext('2d')!;
  const image = context.createImageData(256, 256);
  let state = 0x9e3779b9;
  for (let i = 0; i < image.data.length; i += 4) {
    state = (Math.imul(state ^ (state >>> 15), 0x85ebca6b) + 0x165667b1) >>> 0;
    const value = state & 0xff;
    image.data[i] = value;
    image.data[i + 1] = (value * 3) & 0xff;
    image.data[i + 2] = (value * 7) & 0xff;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return tile;
}

export function photoMaker(): (n: number) => Promise<NormalizedPhoto> {
  const tile = noiseTile();

  const draw = async (size: { width: number; height: number }, hue: number): Promise<Uint8Array> => {
    const canvas = new OffscreenCanvas(size.width, size.height);
    const context = canvas.getContext('2d')!;
    const gradient = context.createLinearGradient(0, 0, size.width, size.height);
    gradient.addColorStop(0, `hsl(${hue} 45% 72%)`);
    gradient.addColorStop(1, `hsl(${(hue + 40) % 360} 40% 45%)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, size.width, size.height);
    context.globalAlpha = 0.25;
    for (let y = 0; y < size.height; y += 256) {
      for (let x = 0; x < size.width; x += 256) context.drawImage(tile, x, y);
    }
    context.globalAlpha = 1;
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
    return new Uint8Array(await blob.arrayBuffer());
  };

  return async (n) => {
    const hue = (n * 37) % 360;
    return { full: await draw(FULL, hue), thumb: await draw(THUMB, hue) };
  };
}
