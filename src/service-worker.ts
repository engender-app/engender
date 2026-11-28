/* Precache the offline shell per release (ADR-0021): fallback HTML,
   app chunks and CSS, SQLite worker and WASM, WOFF2 and static assets
   except PDF fonts. Install OCR library, worker, core and languages as
   one immutable generation, with recognition lazy. Add PDF assets later.

   Wait for the page's update message when no write, migration or import
   is active (lib/pwa/update.ts and lib/data/journal-busy.ts). skipWaiting()
   changes existing controllers, so those documents need their original
   assets until reload or close. First install leaves pages unclaimed. */
/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { base, build, files, version } from '$service-worker';
import { emittedClientAssets } from './lib/pwa/emitted-client-assets.generated';
import { SHELL_CACHE_PREFIX, splitShellAssets } from './lib/pwa/shell-assets';
import { OCR_ASSET_PREFIX } from './lib/pwa/ocr-assets.generated';
import { retainedOcr } from './lib/pwa/retained-ocr';
import { createShellLifetime, retainedShellAsset } from './lib/pwa/shell-lifetime';
import { CACHE_PDF_WORKER } from './lib/pwa/pdf-worker-cache';
import { CLIENT_RELEASE, listenForOnDemandCache, listenForSkipWaiting } from './lib/pwa/sw-messages';

const sw = self as unknown as ServiceWorkerGlobalScope;

/** One cache per release. `version` is SvelteKit's build id, so a new release
    fills its own cache and can never read a half of the previous one. */
const CACHE = `${SHELL_CACHE_PREFIX}${version}`;

/** The fallback document, which every route in this SPA renders from. */
const SHELL = `${base}/`;
const shellLifetime = createShellLifetime(caches, sw.clients, CACHE, base, sw.location.origin);

/* SvelteKit's own `build` list plus the one the plugin in vite.config.ts
   writes from the client bundle. The second exists because the first is
   derived from Vite's manifest, which omits everything Vite's worker pipeline
   emits; both are here because `build` keeps working if the app directory is
   ever renamed out from under that plugin's filter. */
const { shell: PRECACHE, pdfWorker: PDF_WORKER } = splitShellAssets(
  [...new Set([...build, ...emittedClientAssets.map((asset) => base + asset), ...files])],
  base,
  OCR_ASSET_PREFIX
);

listenForSkipWaiting(sw);
sw.addEventListener('message', (event) => {
  const data = event.data;
  if (data?.type !== CLIENT_RELEASE || typeof data.version !== 'string') return;
  if (!event.source || !('id' in event.source) || event.source.type !== 'window') return;
  event.waitUntil(shellLifetime.release(event.source.id, data.version));
});
listenForOnDemandCache(sw, caches, { cacheName: CACHE, assets: PDF_WORKER, message: CACHE_PDF_WORKER });

sw.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      /* The document is fetched past the HTTP cache, because a stale
         index.html would pin this release's shell to the previous one's
         chunk names. The rest are hashed and immutable, so taking them from
         the HTTP cache the page just filled is both safe and one fewer
         download of the WASM. */
      await cache.addAll([new Request(SHELL, { cache: 'reload' }), ...PRECACHE]);
    })()
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(shellLifetime.activate());
});

sw.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  // Nothing off-origin is ours to answer. That the app asks for nothing
  // off-origin in the first place is the release gate's business, and
  // verify-build.mjs checks it both online and offline.
  if (new URL(request.url).origin !== sw.location.origin) return;
  if (request.mode === 'navigate') event.waitUntil(shellLifetime.collect());
  event.respondWith(respond(request));
});

async function respond(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE);

  /* Any navigation renders the shell this worker installed with, so the
     document and the chunks it names always come from the same release. The
     URLs inside it have to be root-absolute for that to work at every depth,
     which is what paths.relative: false in svelte.config.js is for. */
  if (request.mode === 'navigate') {
    const shell = await cache.match(SHELL);
    if (shell) return shell;
  }

  const cached = await cache.match(request)
    ?? await retainedShellAsset(caches, CACHE, request, base, sw.location.origin)
    ?? await retainedOcr(caches, CACHE, request, base);
  if (cached) {
    // Complete cached script reads before handing their bodies to module loaders.
    // Repeated navigation can abort imports served from the cached stream.
    if (request.destination === 'script') return new Response(await cached.arrayBuffer(), cached);
    return cached;
  }

  /* Not part of the shell: SvelteKit's version.json, which has to stay live
     to be an update signal at all, and anything static/ does not hold yet.
     Offline these fail the way they would with no worker installed, which is
     what their callers already handle. */
  return fetch(request);
}
