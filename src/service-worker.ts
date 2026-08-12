/* The offline shell (phase 2, ticket 03; ADR-0021 has the reasoning).
   Everything the app needs to open without a network is precached under one
   key per release: the fallback document, the app's own chunks and CSS,
   SQLocal's worker and its copy of the SQLite WASM, the bundled woff2 faces
   and whatever else sits in static/ - the manifest's icons today, a .riv
   animation the moment one lands there.

   Deliberately absent: skipWaiting(). When a worker that is waiting may take
   over is phase 2 ticket 04's decision, because that question is about a
   journal write in flight, not about caching. Until then a new release
   installs quietly and activates on the browser's own schedule, once no page
   is using the old worker any more. */
/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { base, build, files, version } from '$service-worker';
import { emittedClientAssets } from './lib/pwa/emitted-client-assets.generated';

const sw = self as unknown as ServiceWorkerGlobalScope;

/** One cache per release. `version` is SvelteKit's build id, so a new release
    fills its own cache and can never read a half of the previous one. */
const SHELL_CACHE_PREFIX = 'gender-diary-shell-';
const CACHE = `${SHELL_CACHE_PREFIX}${version}`;

/** The fallback document, which every route in this SPA renders from. */
const SHELL = `${base}/`;

/* SvelteKit's own `build` list plus the one the plugin in vite.config.ts
   writes from the client bundle. The second exists because the first is
   derived from Vite's manifest, which omits everything Vite's worker pipeline
   emits; both are here because `build` keeps working if the app directory is
   ever renamed out from under that plugin's filter. */
const PRECACHE = [
  ...new Set([...build, ...emittedClientAssets.map((asset) => base + asset), ...files])
];

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
  event.waitUntil(
    (async () => {
      // Previous releases' shells, and nothing else on the origin: another
      // cache here would belong to something that is not this worker's.
      for (const key of await caches.keys()) {
        if (key.startsWith(SHELL_CACHE_PREFIX) && key !== CACHE) await caches.delete(key);
      }
    })()
  );
});

sw.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  // Nothing off-origin is ours to answer. That the app asks for nothing
  // off-origin in the first place is the release gate's business, and
  // verify-build.mjs checks it both online and offline.
  if (new URL(request.url).origin !== sw.location.origin) return;
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

  const cached = await cache.match(request);
  if (cached) return cached;

  /* Not part of the shell: SvelteKit's version.json, which has to stay live
     to be an update signal at all, and anything static/ does not hold yet.
     Offline these fail the way they would with no worker installed, which is
     what their callers already handle. */
  return fetch(request);
}
