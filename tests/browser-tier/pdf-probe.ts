/* The PDF renderer, in a real browser (phase 8 features ticket 55).

   Everything documents/pdf.ts does needs things the Node tier does not
   have: a worker, a canvas, and a font directory served over HTTP. So the
   whole module is exercised here, against the hand-written fixture in
   tests/pdf-fixture.mjs.

   The assertion worth naming is the pixel one. The fixture's text is
   Helvetica, which a PDF is allowed to name without carrying, so pdf.js
   has to fetch the face from /pdf-fonts/ on this origin to draw it at all.
   Counting dark pixels on a page whose background the renderer filled
   white is therefore a check on the font path, not only on the drawing:
   with the fonts missing the page comes back blank and the count is
   zero. */

import { openPdf, renderPdfThumbnail } from '../../src/lib/data/documents/pdf.ts';
import { makePdf, makeUnreadablePdf } from '../pdf-fixture.mjs';
import { publish } from '../probe-handshake.mjs';

const NAME = 'pdf';

/* Ticket 04 (phase 9 audit): every Worker pdf.ts constructs against every
   terminate() call on it - the count a resource leak needs, since nothing
   else here would notice a worker still running. */
let workersCreated = 0;
let workersTerminated = 0;
const RealWorker = window.Worker;
window.Worker = class extends RealWorker {
  constructor(...args: ConstructorParameters<typeof RealWorker>) {
    super(...args);
    workersCreated += 1;
  }
  terminate() {
    workersTerminated += 1;
    super.terminate();
  }
} as typeof RealWorker;

/* What the module logged on its way to answering null, which is the
   difference between "the renderer refused this file" and "the probe is
   holding it wrong" - and there is nowhere else to read it, since a
   browser-tier failure arrives as one line in a Node script. */
const complaints: string[] = [];
const consoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  complaints.push(args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' '));
  consoleError(...args);
};

/** How much of a bitmap is neither white nor nearly white. A drawn page of
    black text on white paper is a few percent; a blank one is zero. */
function inkFraction(bitmap: ImageBitmap): number {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 128 && data[i + 1] < 128 && data[i + 2] < 128) dark += 1;
  }
  return dark / (bitmap.width * bitmap.height);
}

async function decode(bytes: Uint8Array): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/jpeg' }));
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

async function run() {
  const fixture = makePdf(['Page one', 'Page two', 'Page three']);

  const open = await openPdf(fixture);
  const first = await open.page(1, 800);
  const third = await open.page(3, 800);

  const rendered = {
    pageCount: open.pageCount,
    longEdge: Math.max(first.width, first.height),
    // A4 is 595x842pt, so a page drawn to its own shape is 0.707 wide.
    aspect: Number((first.width / first.height).toFixed(3)),
    firstInk: inkFraction(first),
    thirdInk: inkFraction(third)
  };
  first.close();
  third.close();

  /* A page number the document does not have. The viewer's own controls
     cannot ask for one, but a file that lost a page between the count and
     the render is the same shape, and the screen's answer to both is a
     line rather than an empty sheet. */
  let refusedMissingPage = false;
  try {
    await open.page(9, 400);
  } catch {
    refusedMissingPage = true;
  }
  open.close();

  const thumb = await renderPdfThumbnail(fixture);
  const thumbnail = thumb
    ? { jpeg: thumb[0] === 0xff && thumb[1] === 0xd8, bytes: thumb.byteLength, ...(await decode(thumb)) }
    : null;

  /* The file the header lied about: openPdf rejects it, and the thumbnail
     comes back null rather than throwing, because a document whose page
     cannot be drawn is still filed (documents/accept.ts). */
  let openedUnreadable = true;
  try {
    await openPdf(makeUnreadablePdf());
  } catch {
    openedUnreadable = false;
  }
  const unreadableThumb = await renderPdfThumbnail(makeUnreadablePdf());

  /* Termination happens after document.destroy() settles (pdf.ts's own
     ordering), so it can still be in flight here. Poll rather than a fixed
     sleep - and give up after 2s so a reintroduced leak fails the count
     below instead of hanging the whole probe. */
  const deadline = Date.now() + 2000;
  while (workersTerminated < workersCreated && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  publish(NAME, {
    rendered,
    refusedMissingPage,
    thumbnail,
    openedUnreadable,
    unreadableThumbIsNull: unreadableThumb === null,
    complaints,
    workerCounts: { created: workersCreated, terminated: workersTerminated }
  });
}

run().catch((error) => publish(NAME, { error: String(error?.message ?? error) }));
