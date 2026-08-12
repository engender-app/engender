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

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // SPA: one static bundle, no SSR, no server — Capacitor wraps it unchanged.
    adapter: adapter({ fallback: 'index.html' }),
    version: isReleaseVersion(version) ? { name: version } : undefined,
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
