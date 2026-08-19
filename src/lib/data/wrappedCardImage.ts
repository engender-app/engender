/* Rasterizing the rendered wrapped card into a shareable PNG (ticket 18).

   WrappedCard.svelte is genuine DOM markup, not something already on a
   canvas the way ticket 27's photo exports are - and redrawing its stat
   tiles and gradient art with canvas primitives would be exactly the
   separate implementation the ticket rules out. The foreignObject trick
   sidesteps that: an SVG can embed a whole HTML subtree and hand it to the
   browser's own image decoder, so what comes out is whatever the component
   actually rendered, captured rather than redrawn.

   The clone gets every descendant's computed style inlined first, because
   the SVG document the browser decodes from has no access to this page's
   stylesheets - without it, .wrapped-card and its children would rasterize
   as unstyled default divs instead of the app's own design tokens. */

const IMAGE_SCALE = 2;

function inlineComputedStyles(source: Element, clone: Element): void {
  const computed = getComputedStyle(source);
  let css = '';
  for (let i = 0; i < computed.length; i++) {
    const property = computed.item(i);
    css += `${property}:${computed.getPropertyValue(property)};`;
  }
  clone.setAttribute('style', css);

  const sourceChildren = source.children;
  const cloneChildren = clone.children;
  for (let i = 0; i < sourceChildren.length; i++) {
    inlineComputedStyles(sourceChildren[i], cloneChildren[i]);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('the wrapped card image failed to decode'));
    image.src = src;
  });
}

/** The node's own rendered appearance, as a PNG Blob. Nothing is on the
    card beyond what is already in this DOM subtree, so nothing here can
    add a journal text or photo the caller did not put there itself. */
export async function renderWrappedCardImage(node: HTMLElement): Promise<Blob> {
  const rect = node.getBoundingClientRect();
  const width = Math.ceil(rect.width);
  const height = Math.ceil(rect.height);
  if (width === 0 || height === 0) throw new Error('the wrapped card has no size to render yet');

  const clone = node.cloneNode(true) as HTMLElement;
  inlineComputedStyles(node, clone);
  clone.style.margin = '0';

  const serialized = new XMLSerializer().serializeToString(clone);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml">${serialized}</div>` +
    `</foreignObject></svg>`;

  /* A data: URI, not a blob: one - Chromium taints the canvas on
     drawImage() from a blob: SVG that contains a foreignObject, even
     same-origin (a long-standing Blink quirk, not a real cross-origin
     leak), which throws "Tainted canvases may not be exported" on the
     toBlob() below. encodeURIComponent rather than btoa, because the
     Polish catalogue's diacritics are outside Latin1 and btoa throws on
     them. */
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  const canvas = document.createElement('canvas');
  canvas.width = width * IMAGE_SCALE;
  canvas.height = height * IMAGE_SCALE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d canvas context to rasterize the wrapped card with');
  context.scale(IMAGE_SCALE, IMAGE_SCALE);
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('rasterizing the wrapped card produced no image');
  return blob;
}
