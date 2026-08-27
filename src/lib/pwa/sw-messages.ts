/* The two messages the page and the service worker exchange (ticket 04, and
   phase 5 performance ticket 01 for the second).

   Imported by both sides - src/service-worker.ts installs the listeners,
   update.ts and labs/ocr-engine.ts send them - and by the browser tier's
   probe workers, so no side can drift apart from another on a string. */

/** Sent to a waiting worker to let it take over. The page only sends it when
    the journal is idle, which is the whole of the guard: the worker itself
    never calls skipWaiting() on its own schedule (ADR-0021). */
export const SKIP_WAITING = 'gender-diary:skip-waiting';

/** Sent once the lab scanner's OCR engine has loaded: the page asking for the
    set the shell deliberately left out to be added to this release's cache, so
    the scanner keeps working offline from here (shell-assets.ts says why it is
    out). The ask carries no paths, and that is the point - the worker owns
    both the cache name and the list, so a page can start the download but
    cannot name what gets stored under the app's key. */
export const CACHE_ON_DEMAND = 'gender-diary:cache-on-demand';

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

/** Called once by a worker at the top level, with the release's cache name and
    the set that was kept out of the install. The add is held open with
    `waitUntil`, because 21 MB is long enough for a browser to decide an idle
    worker can be shut down and a half-stored engine is worse than none.

    A failed add is dropped: the page has the engine either way, this only
    decides whether the next open of the scanner needs the network again. */
export function listenForOnDemandCache(
  sw: MessageScope,
  cacheStore: CacheStore,
  onDemand: { cacheName: string; assets: string[] }
): void {
  sw.addEventListener('message', (event) => {
    if (event.data !== CACHE_ON_DEMAND) return;
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
