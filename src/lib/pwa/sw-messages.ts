/* The one message the page and the service worker exchange (ticket 04).

   Imported by both sides - src/service-worker.ts installs the listener, and
   update.ts sends it - and by the browser tier's probe worker, so the three
   cannot drift apart on a string. */

/** Sent to a waiting worker to let it take over. The page only sends it when
    the journal is idle, which is the whole of the guard: the worker itself
    never calls skipWaiting() on its own schedule (ADR-0021). */
export const SKIP_WAITING = 'gender-diary:skip-waiting';

/** Just the part of ServiceWorkerGlobalScope this needs, so the worker's
    own reference-lib declarations do not have to reach into here. */
interface SkipWaitingScope {
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  skipWaiting(): Promise<void>;
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
