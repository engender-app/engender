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
    /* The script half of the production CSP (ticket 05). It cannot come from
       nginx, because the document holds two inline scripts - the boot-preference
       stamp in app.html and SvelteKit's own start call - whose hashes change
       whenever either changes, and deploy/nginx/journal.conf is copied to the
       box by hand rather than shipped with a release. So SvelteKit computes the
       hashes at build time and writes them into the document as a meta policy,
       and the header keeps script-src wide enough not to contradict it. Both
       policies are enforced and a browser applies the intersection, so what an
       injected inline script actually meets is this list of two hashes.

       Everything not about scripts stays in the header, where it also covers
       the service worker and the responses this policy is not attached to. */
    csp: {
      mode: 'hash',
      directives: { 'script-src': ['self', 'wasm-unsafe-eval', ...appHtmlScriptHashes()] }
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
