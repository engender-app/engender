import { beforeEach, describe, expect, test, vi } from 'vitest';

type TesseractLogger = (message: { status: string; progress: number }) => void;

const recognize = vi.fn(async (_image: unknown) => ({ data: { text: 'ok' } }));
const terminate = vi.fn(async (): Promise<unknown> => undefined);
const createWorker = vi.fn(
  async (_langs: unknown, _oem: unknown, _options?: { logger?: TesseractLogger }) => ({ recognize, terminate })
);

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
      langPath: '/tesseract/lang-data',
      logger: expect.any(Function)
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

  /* Phase 9 audit ticket 11. The bar over a lab-report scan is a real
     fraction rather than a sweep only because the installed tesseract.js
     reports one - so what this pins is that the reading pass is the only
     status turned into one. Loading the core and each language's
     traineddata each sweep 0 to 1 of their own, and forwarding those would
     fill the bar three times before the page is read. */
  test('reports the reading pass and nothing before it', async () => {
    const seen: (number | null)[] = [];
    await tesseractLabOcrEngine().recognize(new Uint8Array([1, 2, 3]), {
      onProgress: (fraction) => seen.push(fraction)
    });

    const logger = createWorker.mock.calls[0][2]?.logger;
    if (!logger) throw new Error('the worker was created without a logger');
    logger({ status: 'loading language traineddata', progress: 0.5 });
    logger({ status: 'initializing api', progress: 1 });
    expect(seen).toEqual([]);

    logger({ status: 'recognizing text', progress: 0.42 });
    logger({ status: 'recognizing text', progress: 1 });
    expect(seen).toEqual([0.42, 1]);
  });

  test('stopping a pass terminates the worker and reports it as an abort', async () => {
    const stop = new AbortController();
    let began: () => void;
    const started = new Promise<void>((resolve) => (began = resolve));
    recognize.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          began();
          // What terminate() does to a call in flight.
          terminate.mockImplementation(async () => reject(new Error('worker terminated')));
        })
    );

    const running = tesseractLabOcrEngine().recognize(new Uint8Array([1, 2, 3]), { signal: stop.signal });
    await started;
    stop.abort();

    /* An AbortError, not the teardown's own error: the screen tells a
       stopped pass apart from a crashed one by the name, and tesseract
       has no cancel of its own to raise one (ocr-machine.ts). */
    await expect(running).rejects.toThrow(expect.objectContaining({ name: 'AbortError' }));
  });
});
