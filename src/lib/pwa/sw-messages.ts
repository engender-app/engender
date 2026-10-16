/* Update activation and the optional PDF worker use fixed messages. */

/** Sent to a waiting worker to let it take over. The page only sends it when
    the journal is idle, which is the whole of the guard: the worker itself
    never calls skipWaiting() on its own schedule (ADR-0021). */
export const SKIP_WAITING = 'engender:skip-waiting';

/** A page reports its compiled release after registration and controller takeover. */
export const CLIENT_RELEASE = 'engender:client-release';

/** Just the part of ServiceWorkerGlobalScope these need, so the worker's own
    reference-lib declarations do not have to reach into here. `waitUntil` is
    what a real ExtendableMessageEvent carries. */
interface MessageScope {
  addEventListener(
    type: 'message',
    listener: (event: { data: unknown; waitUntil(work: Promise<unknown>): void }) => void
  ): void;
}

interface SkipWaitingScope extends MessageScope {
  skipWaiting(): Promise<void>;
}

/** The part of Cache Storage the on-demand add uses, taken as an argument so
    the Node tier can watch what an ask does. */
interface CacheStore {
  open(name: string): Promise<{ addAll(requests: string[]): Promise<void> }>;
}

/** Called once by a worker at the top level: waits to be asked, and never
    activates itself. Anything else arriving on the channel is ignored rather
    than treated as an ask - a worker is reachable from any page on the
    origin, and only this app's own asks are honoured. */
export function listenForSkipWaiting(sw: SkipWaitingScope): void {
  sw.addEventListener('message', (event) => {
    if (event.data === SKIP_WAITING) void sw.skipWaiting();
  });
}

/** The PDF renderer stays optional. A page can ask only for the worker's
    fixed asset list; a failed fetch leaves the request retryable. */
export function listenForOnDemandCache(
  sw: MessageScope,
  cacheStore: CacheStore,
  onDemand: { cacheName: string; assets: string[]; message: string }
): void {
  const message = onDemand.message;
  sw.addEventListener('message', (event) => {
    if (event.data !== message) return;
    event.waitUntil(
      (async () => {
        const cache = await cacheStore.open(onDemand.cacheName);
        /* Past the HTTP cache is exactly what is not wanted here: the page has
           just loaded every one of these, so this second pass is meant to be
           served out of the cache it filled. */
        await cache.addAll(onDemand.assets);
      })().catch(() => {})
    );
  });
}
