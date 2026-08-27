import { beforeEach, describe, expect, test, vi } from 'vitest';

const recognize = vi.fn(async () => ({ data: { text: 'ok' } }));
const terminate = vi.fn(async () => undefined);
const createWorker = vi.fn(async () => ({ recognize, terminate }));

vi.mock('tesseract.js', () => ({ createWorker }));

import { CACHE_ON_DEMAND } from '../../pwa/sw-messages';
import { tesseractLabOcrEngine } from './ocr-engine';

/** What a page controlled by the offline shell sees. Absent by default, which
    is a browser with no worker as well as the Android build (register.ts does
    not install one there). */
function stubServiceWorker(controller: { postMessage: (message: unknown) => void } | null) {
  const original = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  Object.defineProperty(navigator, 'serviceWorker', { value: { controller }, configurable: true });
  return () => {
    if (original) Object.defineProperty(navigator, 'serviceWorker', original);
    else delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  };
}

describe('tesseractLabOcrEngine', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    createWorker.mockResolvedValue({ recognize, terminate });
    recognize.mockResolvedValue({ data: { text: 'ok' } });
    terminate.mockResolvedValue(undefined);
  });

  test('uses local-only Tesseract paths and both PL/EN languages', async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();

    try {
      const result = await tesseractLabOcrEngine().recognize(new Uint8Array([1, 2, 3]));
      expect(result.data.text).toBe('ok');
      expect(createWorker).toHaveBeenCalledWith(['eng', 'pol'], 1, {
        workerPath: '/tesseract/worker.min.js',
        corePath: '/tesseract/tesseract-core.wasm.js',
        langPath: '/tesseract/lang-data'
      });
      expect(recognize).toHaveBeenCalledWith('blob:test');
      expect(terminate).toHaveBeenCalledTimes(1);
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });

  test('asks the offline shell to keep the engine once it has loaded', async () => {
    const postMessage = vi.fn();
    const restore = stubServiceWorker({ postMessage });
    try {
      await tesseractLabOcrEngine().recognize(new Uint8Array([1, 2, 3]));
      expect(postMessage).toHaveBeenCalledWith(CACHE_ON_DEMAND);
    } finally {
      restore();
    }
  });

  test('does not ask when the engine failed to load: half an engine is not worth storing', async () => {
    const postMessage = vi.fn();
    const restore = stubServiceWorker({ postMessage });
    createWorker.mockRejectedValue(new Error('no engine'));
    try {
      await expect(tesseractLabOcrEngine().recognize(new Uint8Array([1, 2, 3]))).rejects.toThrow('no engine');
      expect(postMessage).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  test('recognises with no worker controlling the page, which is every Android run', async () => {
    const restore = stubServiceWorker(null);
    try {
      const result = await tesseractLabOcrEngine().recognize(new Uint8Array([1, 2, 3]));
      expect(result.data.text).toBe('ok');
    } finally {
      restore();
    }
  });
});
