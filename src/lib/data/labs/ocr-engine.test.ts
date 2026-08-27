import { beforeEach, describe, expect, test, vi } from 'vitest';

const recognize = vi.fn(async (_image: unknown) => ({ data: { text: 'ok' } }));
const terminate = vi.fn(async () => undefined);
const createWorker = vi.fn(async () => ({ recognize, terminate }));

vi.mock('tesseract.js', () => ({ createWorker }));

import { CACHE_ON_DEMAND } from '../../pwa/sw-messages';
import { tesseractLabOcrEngine } from './ocr-engine';

/** What a page with the offline shell installed sees. Absent by default,
    which is a browser with no worker as well as the Android build, where
    register.ts installs none.

    A registration with an active worker, rather than a controller: the page
    that installed the worker is not controlled by it, and that is the visit
    the ask has to survive. */
function stubServiceWorker(active: { postMessage: (message: unknown) => void } | null) {
  const original = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { getRegistration: async () => (active ? { active } : undefined) },
    configurable: true
  });
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
    const result = await tesseractLabOcrEngine().recognize(new Uint8Array([1, 2, 3]));
    expect(result.data.text).toBe('ok');
    expect(createWorker).toHaveBeenCalledWith(['eng', 'pol'], 1, {
      workerPath: '/tesseract/worker.min.js',
      corePath: '/tesseract/tesseract-core.wasm.js',
      langPath: '/tesseract/lang-data'
    });
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  /* A Blob passed straight to the worker, not an object URL: the worker reads
     a Blob with FileReader, but fetches a URL string - and this document's
     CSP has no `blob:` in connect-src, so that fetch would be refused before
     recognition ever ran (ticket 44). */
  test('passes the image as a Blob rather than an object URL', async () => {
    await tesseractLabOcrEngine().recognize(new Uint8Array([1, 2, 3]));
    const [passedImage] = recognize.mock.calls[0];
    expect(passedImage).toBeInstanceOf(Blob);
    expect(typeof passedImage).not.toBe('string');
  });

  test('asks the offline shell to keep the engine once it has loaded', async () => {
    const postMessage = vi.fn();
    const restore = stubServiceWorker({ postMessage });
    try {
      await tesseractLabOcrEngine().recognize(new Uint8Array([1, 2, 3]));
      // Sent without being awaited, so the microtask it rides on has to drain.
      await Promise.resolve();
      await Promise.resolve();
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
      await Promise.resolve();
      await Promise.resolve();
      expect(postMessage).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  test('recognises with no worker installed at all, which is every Android run', async () => {
    const restore = stubServiceWorker(null);
    try {
      const result = await tesseractLabOcrEngine().recognize(new Uint8Array([1, 2, 3]));
      expect(result.data.text).toBe('ok');
    } finally {
      restore();
    }
  });
});
