# The Android floor is a WebView version, not an API level

Status: Accepted
Decided: 2026-08-12
Last reviewed: 2026-11-02
Supersedes: none

The app declares `minSdkVersion 26` (`android/variables.gradle`) and `minWebViewVersion 104` (`capacitor.config.ts`). The second number decides whether the app runs. Android ships its WebView as a separately updatable component, so the API level says almost nothing about it: an API 26 phone that has taken updates has a current WebView, and the two numbers move independently. A WebView below the floor gets `static/webview-too-old.html`, in English or Polish, via `server.errorPath`.

## The floor

Raised from 87 to 104 on 2026-10-14. Navigation reads computed `translate` and `scale` (WebView 104), and shared door selectors use `:is()` and complex `:not()` (88). The maintainer chose to raise the floor rather than rewrite those paths for 87. Vite's Chromium target is derived from `minWebViewVersion` in `vite.config.ts`, so the number Android refuses below and the number the bundle compiles to cannot drift apart. The other build targets are Vite's defaults, since the app also ships to browsers. The 104 floor is a source check (`tests/webview-floor.test.ts`), not a claim that a WebView 104 device was run.

The original reason a floor exists: on an API 26 emulator (Chrome 69) the app installed and showed a blank screen with a `SyntaxError` in a log nobody holding a phone can read. That WebView has neither optional chaining nor OPFS, where every photo lives.

## Consequences

**A device below the floor says so only because a page was written for it.** Without `server.errorPath`, Capacitor logs an error and loads the app anyway, which is the blank page. The page has no build step, imports nothing from the bundle and keeps its English and Polish words in the file, because it exists for browsers that cannot run the app. Two small ES5 scripts narrow it from the boot mirror: language, theme, and the app's name only when the mirror does not say disguise is on. It was deleted once as clutter while the config still named it, and devices below the floor went back to a blank screen until it was restored. `tests/webview-too-old-page.test.ts` now fails when `errorPath` names a file missing from `static/` and runs the page's scripts over the disguise and language cases.

**The floor is derived, and the runtime APIs above it are policed.** `build.target` compiles syntax down and leaves methods where it found them. `tests/webview-floor.test.ts` greps `src/` with comments stripped for a short list of post-floor APIs (`Array.prototype.at`, `toReversed`, `toSorted`, `findLast`, `structuredClone`, `Object.hasOwn`, `Object.groupBy`, `Promise.withResolvers`) and fails by name and Chrome version. It also checks computed CSS properties and selector syntax. A dependency's calls are a different case: pdf.js needs `.at` and `structuredClone` on its no-worker path, so `src/lib/data/documents/pdf-floor.ts` polyfills them rather than rewriting the library.

**A capability above the floor is a bug while it is cheap.** `crypto.randomUUID` (Chrome 92) falls back to `getRandomValues`, and `Object.hasOwn` (93) became `hasOwnProperty.call` in `prefs/catalogue.ts`, because it sits on the boot path before first paint. The answer is a few lines, not a higher floor that loses the devices in between.

**Nothing below the floor is tested, and the suite says so.** `tests/android-tier/run.mjs` runs only the native half of its suite on the API 26 emulator (SQLite build, FTS5, window functions, raw-key open), whose WebView cannot start the app, and the full suite on a current Android. The emulator is also the one device where the floor is not met, so it is where the error page is checked. A real API 26 phone with a current WebView runs the same bundle as an API 35 one.

History: floor 87 on 2026-08-12; pinned and derived 2026-09; error page restored 2026-10-14; floor raised to 104 on 2026-10-14; earlier verification history dropped 2026-11-02.