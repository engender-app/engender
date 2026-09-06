/* Drawing a stored PDF (phase 8 features ticket 55, ADR-0065).

   The renderer ships with the app because both ways out are worse: handing
   the bytes to the OS viewer writes a decrypted diagnosis into shared
   storage, and an embedded native viewer is refused by the app's own CSP
   (`object-src 'none'`, `frame-src 'none'`). So pdf.js is here, bundled,
   and everything it needs comes off this origin.

   **Pages come back as images, never as text.** No text layer, no
   selection, no search over contents - ADR-0065 draws that line and this
   module is where it holds: the only thing it can produce is pixels.

   Four options are what make it work under this app's rules:

     - `standardFontDataUrl` at /pdf-fonts/, because pdf.js's default is a
       CDN and `connect-src` is 'self' (scripts/prepare-vendor-assets.mjs
       writes the directory). No `cMapUrl`: the CJK cmaps are 1.7 MB and
       out of scope, and a document that needs them draws the rest of
       itself and misses those glyphs.
     - `disableFontFace`, because loading a font pdf.js has extracted means
       a data: URL through `font-src 'self'`, which the CSP refuses. Off,
       pdf.js draws glyph outlines onto the canvas instead - which is the
       right side of the trade for a viewer that has no text layer anyway.
     - `isEvalSupported: false`, for `script-src` with no 'unsafe-eval'.
     - `useSystemFonts: false`, so a font on the device can never stand in
       for one the document named. The picture is the paper, not this
       machine's idea of it.

   Everything here runs on the main thread and hands the parsing to a
   worker (pdf-worker.ts). The canvases are OffscreenCanvas, so no part of
   this touches the DOM: the same reason photos/normalize.ts is shaped that
   way, and what lets an import render a thumbnail with no screen open. */

import './pdf-floor';
import { THUMB_EDGE, THUMB_QUALITY } from '../photos/normalize';

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

/** A worker of this app's own, for one document.

    Constructed here rather than left to `GlobalWorkerOptions.workerSrc` so
    that Vite bundles the app's entry (pdf-worker.ts) - which is what puts
    the floor patch inside the worker's realm and the worker's bytes in the
    offline shell.

    One each, rather than one shared port, because closing a document
    terminates the worker it was opened with: pdf.js's own `destroy()` ends
    the port as well as the transport, so a second document opened on a
    shared port would find a dead worker, and two open at once would kill
    each other's. */
function workerFor(module: PdfjsModule) {
  return module.PDFWorker.fromPort({
    port: new Worker(new URL('./pdf-worker.ts', import.meta.url), { type: 'module' })
  });
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
  const worker = workerFor(module);

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
      useSystemFonts: false
    }).promise;
  } catch (error) {
    // A file pdf.js refuses is the common case here, not an exceptional
    // one (a scan somebody re-saved, an encrypted export), and each one
    // arrives with a live worker that nothing else will ever close.
    worker.destroy();
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
      void document.destroy();
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
