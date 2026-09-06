import type { RecognizeResult } from 'tesseract.js';
import { ON_DEMAND_PREFIX } from '../../pwa/shell-assets';
import { CACHE_ON_DEMAND } from '../../pwa/sw-messages';

interface LabOcrEngine {
  recognize(image: Uint8Array): Promise<RecognizeResult>;
}

const TESSERACT_LANGS = ['eng', 'pol'];

export function tesseractLabOcrEngine(): LabOcrEngine {
  return {
    async recognize(image) {
      const { createWorker } = await import('tesseract.js');

      // Local-only paths: OCR workers and language data are loaded from app assets.
      const worker = await createWorker(TESSERACT_LANGS, 1, {
        workerPath: `${ON_DEMAND_PREFIX}worker.min.js`,
        corePath: `${ON_DEMAND_PREFIX}tesseract-core.wasm.js`,
        langPath: `${ON_DEMAND_PREFIX}lang-data`
      });

      /* The engine is here, so the offline shell can have it too (phase 5
         performance ticket 01). Asked for after the load rather than before,
         because a failed load is not something to store, and asked for on
         every load rather than once, because the cache is keyed per release
         and there is nothing here that knows which release filled it - a
         repeat ask against a full cache costs a handful of reads.

         Sent to the registration rather than to navigator.serviceWorker
         .controller, which is null on precisely the visit this matters most:
         the worker does not claim clients (ADR-0021), so the page that
         installed it is not controlled by it, and a first visit that opens the
         scanner would have asked nobody. The registration is reachable from an
         uncontrolled page.

         Nothing is awaited: this is the worker's errand from here, and the
         recognition the person is waiting for does not queue behind it. */
      void navigator.serviceWorker
        ?.getRegistration()
        .then((registration) => registration?.active?.postMessage(CACHE_ON_DEMAND))
        .catch(() => {});

      const bytes = new Uint8Array(image);
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      /* A Blob passed straight to tesseract.js, not an object URL: the worker
         reads a Blob with FileReader, but a URL string it fetches - and this
         document's CSP has no `blob:` in connect-src, so that fetch is
         refused before recognition ever runs (found only once ticket 44 made
         the sheet reachable enough to try). */
      const blob = new Blob([buffer], { type: 'image/*' });
      try {
        return await worker.recognize(blob);
      } finally {
        await worker.terminate();
      }
    }
  };
}
