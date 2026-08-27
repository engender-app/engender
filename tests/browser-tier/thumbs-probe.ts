/* Browser-tier check for the phase 5 audit's ticket 03, finding 04.

   Two halves of that ticket can only be proved with a real layout and a
   real IntersectionObserver: that a tile which has never come near the
   screen reads nothing, and that scrolling the whole grid and back leaves
   no blob URL behind. A Node-tier test has no viewport to be outside of.

   The store here is a fake that records what it was asked for - the point
   is which names were read and in how many calls, which is a property of
   the queue in photoFiles.ts and of the gate in PhotoThumb, not of OPFS. */

import { mount } from 'svelte';
import PhotoThumb from '../../src/lib/components/PhotoThumb.svelte';
import { setPhotoFiles } from '../../src/lib/stores/photoFiles.ts';
import type { PhotoFileStore } from '../../src/lib/data/journal/journal.ts';
import { publish } from '../probe-handshake.mjs';

const NAME = 'thumbs';
const TILES = 60;
/** The tile with no stored file: its row exists, its bytes are gone, and
    it has to draw as a placeholder rather than as a gap. */
const MISSING = 1;

/** A real JPEG, so the tiles hold something a browser will actually
    decode rather than bytes that only look like a blob URL. */
async function tinyJpeg(): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(8, 8);
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#c94f7c';
  context.fillRect(0, 0, 8, 8);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg' });
  return new Uint8Array(await blob.arrayBuffer());
}

/** Blob URLs alive right now. Counted by wrapping the two calls rather
    than by asking the browser, which has no way to report them. */
let live = 0;
const createObjectURL = URL.createObjectURL.bind(URL);
const revokeObjectURL = URL.revokeObjectURL.bind(URL);
URL.createObjectURL = (object: Blob | MediaSource) => {
  live += 1;
  return createObjectURL(object as Blob);
};
URL.revokeObjectURL = (url: string) => {
  live -= 1;
  revokeObjectURL(url);
};

const frames = (count: number) =>
  new Promise<void>((resolve) => {
    let left = count;
    const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  });
/* Long enough for the observer to deliver, Svelte to flush and the queue's
   microtask to have read - not a timing assertion, just a wait. */
const settle = async () => {
  await frames(4);
  await new Promise((resolve) => setTimeout(resolve, 150));
  await frames(2);
};

const scrollTo = async (top: number) => {
  window.scrollTo({ top, behavior: 'instant' });
  await settle();
};

const drawn = () => document.querySelectorAll('#grid img').length;
const placeholders = () => document.querySelectorAll('#grid [role="img"]').length;

async function run() {
  const jpeg = await tinyJpeg();
  const reads: string[] = [];
  const batches: string[][] = [];
  const bytesFor = (name: string) => (name.startsWith(`p${MISSING}-`) ? null : jpeg);
  const files: PhotoFileStore = {
    async write() {},
    async read(name) {
      reads.push(name);
      return bytesFor(name);
    },
    async readMany(names) {
      batches.push([...names]);
      reads.push(...names);
      return names.map(bytesFor);
    },
    async size() {
      return null;
    },
    async remove() {},
    async list() {
      return [];
    }
  };
  setPhotoFiles(files);

  const grid = document.querySelector('#grid')!;
  for (let i = 0; i < TILES; i += 1) {
    const cell = document.createElement('div');
    grid.append(cell);
    mount(PhotoThumb, {
      target: cell,
      props: { photo: { id: `id-${i}`, fileName: `p${i}.jpg` }, size: 104 }
    });
  }

  await settle();
  const onMount = {
    batches: batches.length,
    names: [...reads],
    drawn: drawn(),
    placeholders: placeholders(),
    live
  };
  const lastRead = reads.includes(`p${TILES - 1}-thumb.jpg`);

  await scrollTo(document.body.scrollHeight);
  const atBottom = { live, names: [...reads] };

  await scrollTo(0);
  const backAtTop = { live };

  return { tiles: TILES, onMount, lastTileReadOnMount: lastRead, atBottom, backAtTop };
}

run().then(
  (result) => publish(NAME, result),
  (error: unknown) =>
    publish(NAME, { error: error instanceof Error ? `${error.message}\n${error.stack}` : String(error) })
);
