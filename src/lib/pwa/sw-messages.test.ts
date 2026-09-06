import { describe, expect, test, vi } from 'vitest';
import { CACHE_ON_DEMAND, SKIP_WAITING, listenForOnDemandCache, listenForSkipWaiting } from './sw-messages';

/** A scope that records what was registered and can be sent a message. The
    `waitUntil` it hands the listener is the one a real message event carries,
    and what the worker is kept alive for is recorded here. */
function fakeScope() {
  const listeners: Array<(event: { data: unknown; waitUntil(work: Promise<unknown>): void }) => void> = [];
  const held: Array<Promise<unknown>> = [];
  return {
    held,
    skipWaiting: vi.fn(async () => undefined),
    addEventListener(
      _type: 'message',
      handler: (event: { data: unknown; waitUntil(work: Promise<unknown>): void }) => void
    ) {
      listeners.push(handler);
    },
    send(data: unknown) {
      for (const listener of listeners) listener({ data, waitUntil: (work) => void held.push(work) });
    }
  };
}

/** Just enough of the Cache Storage API to see what an ask added. */
function fakeCaches() {
  const added: Record<string, string[]> = {};
  return {
    added,
    open: vi.fn(async (name: string) => ({
      addAll: async (requests: string[]) => {
        (added[name] ??= []).push(...requests);
      }
    }))
  };
}

describe('listenForSkipWaiting', () => {
  test('stops waiting when asked, and ignores anything else on the channel', () => {
    const sw = fakeScope();
    listenForSkipWaiting(sw);

    sw.send('some other page on the origin');
    expect(sw.skipWaiting).not.toHaveBeenCalled();

    sw.send(SKIP_WAITING);
    expect(sw.skipWaiting).toHaveBeenCalledTimes(1);
  });
});

describe('listenForOnDemandCache', () => {
  test('adds the set the worker owns to the release cache when asked', async () => {
    const sw = fakeScope();
    const caches = fakeCaches();
    listenForOnDemandCache(sw, caches, {
      cacheName: 'engender-shell-abc',
      assets: ['/tesseract/worker.min.js', '/tesseract/tesseract-core.wasm']
    });

    sw.send(CACHE_ON_DEMAND);
    /* Held open while it runs: 21 MB is long enough for a browser to decide an
       idle worker can be shut down, and half a cached engine is worse than
       none. */
    expect(sw.held).toHaveLength(1);
    await Promise.all(sw.held);

    expect(caches.added['engender-shell-abc']).toEqual([
      '/tesseract/worker.min.js',
      '/tesseract/tesseract-core.wasm'
    ]);
  });

  test('the ask carries no paths of its own, so another page cannot name what gets cached', async () => {
    const sw = fakeScope();
    const caches = fakeCaches();
    listenForOnDemandCache(sw, caches, { cacheName: 'engender-shell-abc', assets: ['/tesseract/worker.min.js'] });

    sw.send({ type: CACHE_ON_DEMAND, assets: ['https://example.test/tracker.js'] });
    sw.send('engender:something-else');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(caches.open).not.toHaveBeenCalled();
  });

  test('a failed ask is dropped rather than left as an unhandled rejection', async () => {
    const sw = fakeScope();
    const caches = {
      open: vi.fn(async () => ({
        addAll: async () => {
          throw new Error('offline');
        }
      }))
    };
    listenForOnDemandCache(sw, caches, { cacheName: 'engender-shell-abc', assets: ['/tesseract/worker.min.js'] });

    sw.send(CACHE_ON_DEMAND);
    await expect(Promise.all(sw.held)).resolves.toBeDefined();
    expect(caches.open).toHaveBeenCalledTimes(1);
  });
});
