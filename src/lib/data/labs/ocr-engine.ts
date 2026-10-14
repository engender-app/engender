import type { RecognizeResult } from 'tesseract.js';
import { OCR_ASSET_PREFIX } from '../../pwa/ocr-assets.generated';
import { loadOcrRuntime } from './ocr-runtime';
import type { OcrWatch } from './ocr-machine';

interface LabOcrEngine {
  recognize(image: Uint8Array, watch?: OcrWatch): Promise<RecognizeResult>;
}

const TESSERACT_LANGS = ['eng', 'pol'];

/* The one status worth turning into a bar (phase 9 audit ticket 11). The
   installed tesseract.js reports through its logger under several statuses
   - loading its core, fetching each language's traineddata, initialising
   the API - and each of those sweeps its own 0 to 1. Reporting all of them
   would fill the bar three times before the work anyone is waiting for
   starts, so everything before this one runs indeterminate and the
   fraction begins when the page is actually being read. */
const RECOGNIZING = 'recognizing text';

export function tesseractLabOcrEngine(): LabOcrEngine {
  return {
    async recognize(image, watch) {
      watch?.signal?.throwIfAborted();
      const { createWorker } = await loadOcrRuntime();

      // Local-only paths: OCR workers and language data are loaded from app assets.
      const worker = await createWorker(TESSERACT_LANGS, 1, {
        workerPath: `${OCR_ASSET_PREFIX}worker.min.js`,
        corePath: `${OCR_ASSET_PREFIX}tesseract-core.wasm.js`,
        langPath: `${OCR_ASSET_PREFIX}lang-data`,
        // Keep web/APK names identical; Tesseract gunzips the payload by magic bytes.
        gzip: false,
        // Cache Storage (or the APK) owns the model, not a global IndexedDB key.
        cacheMethod: 'none',
        logger: ({ status, progress }) => {
          if (status === RECOGNIZING) watch?.onProgress?.(progress);
        }
      });

      const bytes = new Uint8Array(image);
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      /* A Blob passed straight to tesseract.js, not an object URL: the worker
         reads a Blob with FileReader, but a URL string it fetches - and this
         document's CSP has no `blob:` in connect-src, so that fetch is
         refused before recognition ever runs (found only once ticket 44 made
         the sheet reachable enough to try). */
      const blob = new Blob([buffer], { type: 'image/*' });
      /* Terminating the worker is the only stop tesseract.js has - there is
         no cancel on `recognize` - and it makes the pending call reject.
         The reject arrives as whatever the teardown threw rather than as
         an AbortError, so the throwIfAborted in the finally is what turns
         a stopped pass into one, and the listener is removed either way so
         a signal held by a longer-lived caller does not keep this worker
         reachable. */
      const stop = () => void worker.terminate();
      watch?.signal?.addEventListener('abort', stop, { once: true });
      try {
        return await worker.recognize(blob);
      } finally {
        watch?.signal?.removeEventListener('abort', stop);
        await worker.terminate();
        watch?.signal?.throwIfAborted();
      }
    }
  };
}
