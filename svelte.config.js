import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { appVersion, isReleaseVersion } from './scripts/app-version.mjs';

/* SvelteKit's build id, which ADR-0021 keys the offline-shell cache to and
   ADR-0022 keeps separate from the public version name. Its default is the
   time of the build, and it is folded into the entry chunk, so it changes
   every chunk hash: two builds of the same commit share no bytes.

   A release has to be reproducible from its tag - a checksum over a bundle
   nobody can rebuild says only that the file was not corrupted in transit -
   so a build that was given a release version uses it as the build id too.
   Development builds keep the timestamp, where changing on every build is
   the useful behaviour: it is what stops two of them sharing a shell cache. */
const version = appVersion();

/** The sha256 of every inline script in `src/app.html`, in CSP's spelling.

    SvelteKit hashes the start call it injects itself and nothing else, so
    without this the boot-preference stamp - the one script that has to run
    before the first paint, which is why it is inline at all - is the script
    the policy blocks. The template copies these through verbatim, so hashing
    the source is hashing what ships; `tests/csp.test.ts` hashes the built
    document instead and fails if that ever stops being true. */
function appHtmlScriptHashes() {
  const html = readFileSync('src/app.html', 'utf8');
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
    (match) => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`
  );
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // SPA: one static bundle, no SSR, no server — Capacitor wraps it unchanged.
    adapter: adapter({ fallback: 'index.html' }),
    version: isReleaseVersion(version) ? { name: version } : undefined,
    /* The production CSP, written into the document as a meta policy.

       Why it is here rather than only in nginx: the document holds two inline
       scripts - the boot-preference stamp in app.html and SvelteKit's own start
       call - whose hashes change whenever either changes, and
       deploy/nginx/journal-headers.conf is copied to the box by hand rather
       than shipped with a release. So the build computes the hashes and the
       header keeps script-src wide enough not to contradict them. Both policies
       are enforced on the web and a browser applies the intersection, so what
       an injected inline script actually meets is this list of two hashes.

       Why the *whole* set is here and not just script-src (phase 5 ticket 03):
       the Capacitor shell serves its own origin from the APK and never sees an
       nginx header, so the header-only directives were not enforced on Android
       at all - and Android is the platform holding real journals. connect-src
       'self' is the one that matters most there: the data key crosses the
       bridge as hex and lives in JS memory for the session, so script
       injection is the bug that reaches it, and connect-src is what turns a
       successful injection into something that cannot send it anywhere.

       The header stays as it is. It still covers responses that carry no
       document - the service worker, the manifest, the fonts - and the two
       lists are cross-checked in tests/csp.test.ts so they cannot drift apart
       again.

       frame-ancestors is the one directive that cannot come along: a browser
       parses it in a meta policy and ignores it, so the header is its only
       home. Nothing frames a Capacitor WebView anyway. */
    csp: {
      mode: 'hash',
      directives: {
        'default-src': ['self'],
        'base-uri': ['self'],
        'object-src': ['none'],
        'frame-src': ['none'],
        'form-action': ['none'],
        'script-src': ['self', 'wasm-unsafe-eval', ...appHtmlScriptHashes()],
        /* Kept wide deliberately, matching the header. Svelte writes style
           attributes into prerendered markup, and hashing those would mean a
           hash per component render. Narrowing it is a separate change with
           its own before/after, not a rider on this one. */
        'style-src': ['self', 'unsafe-inline'],
        /* blob: for photo thumbnails, which are decrypted into memory and
           shown through URL.createObjectURL; data: for the inline SVG icons
           and the favicon. */
        'img-src': ['self', 'blob:', 'data:'],
        'font-src': ['self'],
        'connect-src': ['self'],
        // A worker may be constructed from a blob URL - tesseract.js does.
        'worker-src': ['self', 'blob:'],
        'manifest-src': ['self'],
        /* blob: and nothing else, for the two players: a voice note and a
           timelapse preview both feed a decrypted recording to their element
           through an object URL. Neither ever loads media from a URL, so an
           element reaching for one is a bug worth blocking. */
        'media-src': ['self', 'blob:']
      }
    },
    paths: {
      /* Root-absolute asset URLs, against SvelteKit's default of relative
         ones: the service worker answers every navigation with one precached
         document, so the URLs inside it have to mean the same thing at
         /settings/labs as at / (ADR-0021). Both this app and Capacitor's
         shell are served from the root of their origin, so nothing here
         needs the portability relative paths buy. */
      relative: false,
    },
  },
};

export default config;
