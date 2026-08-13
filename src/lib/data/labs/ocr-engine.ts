import type { RecognizeResult } from 'tesseract.js';

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
        workerPath: '/tesseract/worker.min.js',
        corePath: '/tesseract/tesseract-core.wasm.js',
        langPath: '/tesseract/lang-data'
      });

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
