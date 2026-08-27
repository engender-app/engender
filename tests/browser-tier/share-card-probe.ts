/* Browser-tier check for ticket 18's wrapped share card. Two things a Node
   test cannot show: that renderWrappedCardImage() produces a real picture
   of what WrappedCard.svelte actually renders - the app's own stylesheets
   and the active palette's gradient, not a blank div - and that a card with
   nothing picked comes back with no painted art strip and no stat tile,
   which is the acceptance rule at the pixel level rather than just in the
   selection logic wrappedShare.test.ts already covers. */

import { mount, unmount } from 'svelte';
import WrappedCard from '../../src/lib/components/WrappedCard.svelte';
import { renderWrappedCardImage } from '../../src/lib/data/wrappedCardImage.ts';
import '../../src/lib/theme/fonts.css';
import '../../src/lib/theme/base.css';
import '../../src/lib/theme/palettes.css';
import '../../src/lib/styles/app.css';
import '../../src/lib/styles/components.css';
import '../../src/lib/styles/screens.css';
import { publish } from '../probe-handshake.mjs';

const NAME = 'share-card-probe';

document.documentElement.dataset.palette = 'trans';
document.documentElement.dataset.theme = 'light';

async function pixelAt(blob: Blob, x: number, y: number): Promise<number[]> {
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  const data = context.getImageData(x, y, 1, 1).data;
  bitmap.close();
  return [data[0], data[1], data[2]];
}

async function run() {
  const result: Record<string, unknown> = {};
  const host = document.createElement('div');
  host.style.width = '360px';
  document.body.appendChild(host);

  // --- everything picked ---------------------------------------------------
  const full = mount(WrappedCard, {
    target: host,
    props: { content: { stats: [{ label: 'Entries', value: '12' }], paletteArt: true } }
  });

  const fullNode = host.querySelector('[data-wrapped-card]') as HTMLElement;
  const artNode = host.querySelector('[data-wrapped-card-art]') as HTMLElement;
  const cardRect = fullNode.getBoundingClientRect();
  const artRect = artNode.getBoundingClientRect();

  const fullBlob = await renderWrappedCardImage(fullNode);
  result.fullType = fullBlob.type;
  const fullBitmap = await createImageBitmap(fullBlob);
  result.fullSize = { width: fullBitmap.width, height: fullBitmap.height };
  fullBitmap.close();

  // Near the art strip's left edge, mid-height: the gradient's first stop
  // (the trans flag's own blue, #5BCEFA) dominates there and nowhere near
  // the surface's white background, so a hit proves the art really painted.
  result.artPixel = await pixelAt(
    fullBlob,
    Math.round((artRect.x - cardRect.x + artRect.width * 0.05) * 2),
    Math.round((artRect.y - cardRect.y + artRect.height / 2) * 2)
  );
  result.statText = host.querySelector('[data-wrapped-stat] strong')?.textContent;

  unmount(full);
  host.innerHTML = '';

  // --- nothing picked --------------------------------------------------------
  const empty = mount(WrappedCard, { target: host, props: { content: { stats: [], paletteArt: false } } });
  const emptyNode = host.querySelector('[data-wrapped-card]') as HTMLElement;
  result.emptyHasArt = emptyNode.querySelector('[data-wrapped-card-art]') !== null;
  result.emptyHasStats = emptyNode.querySelector('[data-wrapped-stat]') !== null;

  const emptyBlob = await renderWrappedCardImage(emptyNode);
  const emptyBitmap = await createImageBitmap(emptyBlob);
  result.emptySize = { width: emptyBitmap.width, height: emptyBitmap.height };
  emptyBitmap.close();
  unmount(empty);

  publish(NAME, result);
}

run().catch((err) => publish(NAME, { error: String(err?.stack ?? err) }));
