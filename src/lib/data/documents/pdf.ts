/* Render PDFs locally as images (ADR-0065). An OS viewer requires a decrypted
   file in shared storage; CSP blocks embedded native viewers. The viewer
   supports no text layer, selection or search.

   pdf.js uses /pdf-fonts/ for standard fonts under connect-src 'self'. The
   1.7 MB CJK cmaps are omitted, so documents needing them can miss glyphs.
   disableFontFace draws glyph outlines on canvas, avoiding data: fonts under
   font-src 'self'. Disable eval and system fonts so the renderer follows
   script-src and uses the document's fonts.

   pdf-worker.ts parses the document; the main thread renders into
   OffscreenCanvas. Import can create thumbnails without a mounted screen. */

import './pdf-floor';
import { CACHE_PDF_WORKER } from '../../pwa/pdf-worker-cache';
import { THUMB_EDGE, THUMB_QUALITY } from '../photos/normalize';
import { PDF_DOCUMENT_BUDGET } from '../media/budget';

type PdfjsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

/** Where prepare-vendor-assets.mjs writes the fourteen standard faces. */
const STANDARD_FONTS = '/pdf-fonts/';

let loading: Promise<PdfjsModule> | null = null;

/** pdf.js itself, loaded once and only when a document is opened.

    Dynamically imported, the way the OCR engine is (labs/ocr-engine.ts):
    the library is about a megabyte, and nobody who never opens a document
    should parse it on the way to Home. */
function pdfjs(): Promise<PdfjsModule> {
  loading ??= import('pdfjs-dist/legacy/build/pdf.mjs');
  return loading;
}

/** Bundle pdf-worker.ts to apply its compatibility patch in the worker.
    PDFWorker.fromPort claims one port per document. destroy() leaves it live.
    Keep the raw Worker so the owner can terminate it. Ask the service worker
    to cache the worker and fonts on demand, including retries after a failure. */
function workerFor(module: PdfjsModule) {
  const port = new Worker(new URL('./pdf-worker.ts', import.meta.url), { type: 'module' });
  void navigator.serviceWorker
    ?.getRegistration()
    .then((registration) => registration?.active?.postMessage(CACHE_PDF_WORKER))
    .catch(() => {});
  return { worker: module.PDFWorker.fromPort({ port }), port };
}

/** An open document: how many pages it has, and any one of them as pixels.
    Closed by whoever opened it - a screen that leaves has to say so, or
    the worker goes on holding the whole file. */
export interface OpenPdf {
  readonly pageCount: number;
  /** Page `pageNumber` (1-based), drawn so its long edge is `maxEdge`
      device pixels. Rejects when that page cannot be rendered, which the
      viewer says in a line rather than leaving an empty canvas. */
  page(pageNumber: number, maxEdge: number): Promise<ImageBitmap>;
  close(): void;
}

export async function openPdf(bytes: Uint8Array): Promise<OpenPdf> {
  const module = await pdfjs();
  const { worker, port } = workerFor(module);

  let document;
  try {
    document = await module.getDocument({
      worker,
      /* A copy, because pdf.js transfers the buffer to the worker and
         leaves the caller holding a detached one - and the caller here is
         a screen that still has to be able to write the original file
         back out. */
      data: bytes.slice(),
      standardFontDataUrl: STANDARD_FONTS,
      disableFontFace: true,
      isEvalSupported: false,
      useSystemFonts: false,
      /* An image over the pixel budget is skipped rather than decoded, and
         pdf.js's own canvases are capped (media/budget.ts): a PDF under
         the 25 MB file ceiling can still declare an image of billions of
         pixels. The page still draws without it. */
      ...PDF_DOCUMENT_BUDGET
    }).promise;
  } catch (error) {
    // A file pdf.js refuses is the common case here, not an exceptional
    // one (a scan somebody re-saved, an encrypted export), and each one
    // arrives with a live worker that nothing else will ever close.
    worker.destroy();
    port.terminate();
    throw error;
  }

  return {
    pageCount: document.numPages,

    async page(pageNumber, maxEdge) {
      const page = await document.getPage(pageNumber);
      try {
        const unscaled = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: maxEdge / Math.max(unscaled.width, unscaled.height) });
        const canvas = new OffscreenCanvas(Math.max(1, Math.round(viewport.width)), Math.max(1, Math.round(viewport.height)));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('no 2d canvas context to draw a page with');

        /* Paper is white and a canvas starts transparent, so a page drawn
           straight onto one would take the screen's own background through
           its margins - and read as a dark sheet in the dark theme, which
           no scan of a document ever is. */
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: context as unknown as CanvasRenderingContext2D, viewport }).promise;
        return canvas.transferToImageBitmap();
      } finally {
        page.cleanup();
      }
    },

    close() {
      // The document first, so the parsed state is released cleanly - then
      // the thread, which pdf.js's own destroy() never reaches (see
      // workerFor's comment above).
      void document.destroy().then(() => {
        worker.destroy();
        port.terminate();
      });
    }
  };
}

/** A document's first page as the same JPEG a photo's thumbnail is: the
    long edge at THUMB_EDGE, the same quality, so a PDF and a scan sit in
    the store as the same kind of thing (journal/documents.ts names them
    the same way too).

    Null rather than a throw when the file cannot be rendered. A PDF this
    renderer cannot read is still a document worth keeping - it is filed,
    it is exported, and it is the one case where the screen has no page to
    show and says so (ADR-0065's own "the app never reads a document" is
    about contents, not about refusing the file). */
export async function renderPdfThumbnail(bytes: Uint8Array): Promise<Uint8Array | null> {
  let open: OpenPdf | null = null;
  try {
    open = await openPdf(bytes);
    const page = await open.page(1, THUMB_EDGE);
    try {
      const canvas = new OffscreenCanvas(page.width, page.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('no 2d canvas context to encode a page thumbnail with');
      context.drawImage(page, 0, 0);
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: THUMB_QUALITY });
      return new Uint8Array(await blob.arrayBuffer());
    } finally {
      page.close();
    }
  } catch (error) {
    console.error('a PDF could not be rendered for its thumbnail', error);
    return null;
  } finally {
    open?.close();
  }
}
