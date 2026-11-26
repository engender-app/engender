# The offline shell is one document and one cache per release

Status: Accepted
Decided: 2026-08-12
Last reviewed: 2026-11-02
Supersedes: none

On the web, the service worker (`src/service-worker.ts`) precaches the release into a cache named after the build version and answers every navigation with the single fallback document it finds there. Asset URLs are root-absolute (`paths.relative: false` in `svelte.config.js`). The worker never takes over on its own schedule; a page asks it to, and only when idle. Android has no worker.

## Why

The journal is a static SPA with one fallback page, so `/calendar`, `/settings/labs` and `/entry/new/today` all render from the same document. SvelteKit's default writes asset URLs relative to the path a page was served at, which is right only at the depth it was rendered for: the shell cached from `/` would ask `/entry/new/today` for `/entry/new/_app/immutable/entry/start.js`, and an offline start on a nested route would die with no chunks. A server hides this by rewriting the document per request; a worker serving from cache cannot.

Keying the cache to the build version stops one load from combining release generations. A release fills its own cache and cannot read half of the previous one, so the document and the hashed chunks it names come from the same build. On a release the build id is the version (ADR-0022), so the cache is named after it.

The precache list is what the client build emitted (`emitted-client-assets.generated`, written by a plugin in `vite.config.ts`), not what Vite's manifest mentions. The manifest omits what Vite's worker pipeline writes, so a shell built from SvelteKit's `build` list alone opens offline and dies on the first read of the journal, because the SQLite worker and its WASM are missing.

## What the shell holds

The app's chunks and CSS, the SQLite worker and WASM, the bundled fonts and `static/` assets.

**OCR for lab slips is the carve-out.** The scanner's Tesseract library, worker, core and both languages are large and are used only when a scan starts, so recognition stays lazy (`labs/ocr-engine.ts` initializes it on demand). The files themselves install with the shell as one immutable generation under a hash-named `/tesseract/<hash>/` path from `scripts/prepare-vendor-assets.mjs`, so the scanner works offline. `lib/pwa/retained-ocr.ts` keeps earlier generations alive after their shell is gone, so an old OCR URL never resolves to newer bytes. The PDF renderer's worker and fonts load on demand: a page asks the worker to add a fixed list (`listenForOnDemandCache`), and a failed fetch stays retryable.

## Updates

A new release installs quietly and waits. A page sends `SKIP_WAITING` only when nothing is running that an activation must not land on: an entry save, a migration or an archive import (`lib/pwa/update.ts` reads `lib/data/journal-busy.ts`). No button is offered during one; the offer appears when the write lands. `clients.claim()` stays out, so a page loaded on the old worker keeps it until it reloads, in one step the person chose. `lib/pwa/shell-lifetime.ts` keeps an older shell while any document loaded from it is still open, recorded as receipts in the shell itself.

## Android

The shell does not exist on Android. Every asset the WebView loads is already a local file in the APK, and a release arrives as an APK, so neither the offline half nor the update half applies. `lib/pwa/register.ts` returns early there and unregisters a worker left by an older install, which would otherwise keep answering navigations from the release it cached after an APK update.

## Consequences

Deploying the journal anywhere but the root of its origin needs this decision revisited; the fixed production origin (ADR-0019) rules that out. Every release fills its whole shell again, because the cache name changes with the version even for assets whose hashes did not. Only the document is fetched past the HTTP cache, so unchanged hashed assets are usually re-stored rather than re-downloaded. That is the cost of never mixing generations.

History: amended 2026-08-21 (activation waits to be asked), 2026-09-01 (OCR left out of the shell, no worker on Android) and since then (OCR returned as an immutable generation with the shell, retained across releases; PDF assets on demand); size figures dropped 2026-11-02.