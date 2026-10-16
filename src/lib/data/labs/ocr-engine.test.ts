import { beforeEach, describe, expect, test, vi } from 'vitest';

type TesseractLogger = (message: { status: string; progress: number }) => void;

const recognize = vi.fn(async (_image: unknown) => ({ data: { text: 'ok' } }));
const terminate = vi.fn(async (): Promise<unknown> => undefined);
const createWorker = vi.fn(
  async (_langs: unknown, _oem: unknown, _options?: { logger?: TesseractLogger }) => ({ recognize, terminate })
);

vi.mock('./ocr-runtime', () => ({ loadOcrRuntime: async () => ({ createWorker }) }));

import { OCR_ASSET_PREFIX } from '../../pwa/ocr-assets.generated';
import { tesseractLabOcrEngine } from './ocr-engine';

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
      workerPath: `${OCR_ASSET_PREFIX}worker.min.js`,
      corePath: `${OCR_ASSET_PREFIX}tesseract-core.wasm.js`,
      langPath: `${OCR_ASSET_PREFIX}lang-data`,
      gzip: false,
      cacheMethod: 'none',
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

  test('propagates initialization failure without a cache download request', async () => {
    createWorker.mockRejectedValue(new Error('no engine'));
    await expect(tesseractLabOcrEngine().recognize(new Uint8Array([1, 2, 3]))).rejects.toThrow('no engine');
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
