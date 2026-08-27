import type { RecognizeResult } from 'tesseract.js';
import { ON_DEMAND_PREFIX } from '../../pwa/shell-assets';
import { CACHE_ON_DEMAND } from '../../pwa/sw-messages';

export interface LabOcrEngine {
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

         Nothing is awaited: this is the worker's errand from here, and the
         recognition the person is waiting for does not queue behind it. */
      navigator.serviceWorker?.controller?.postMessage(CACHE_ON_DEMAND);

      const bytes = new Uint8Array(image);
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const blob = new Blob([buffer], { type: 'image/*' });
      const url = URL.createObjectURL(blob);
      try {
        return await worker.recognize(url);
      } finally {
        URL.revokeObjectURL(url);
        await worker.terminate();
      }
    }
  };
}
