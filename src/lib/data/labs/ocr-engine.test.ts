import { beforeEach, describe, expect, test, vi } from 'vitest';

const recognize = vi.fn(async () => ({ data: { text: 'ok' } }));
const terminate = vi.fn(async () => undefined);
const createWorker = vi.fn(async () => ({ recognize, terminate }));

vi.mock('tesseract.js', () => ({ createWorker }));

import { tesseractLabOcrEngine } from './ocr-engine';

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
});
