import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // SPA: one static bundle, no SSR, no server — Capacitor wraps it unchanged.
    adapter: adapter({ fallback: 'index.html' }),
    paths: {
      /* Root-absolute asset URLs, against SvelteKit's default of relative
         ones: the service worker answers every navigation with one precached
         document, so the URLs inside it have to mean the same thing at
         /settings/labs as at / (ADR-0020). Both this app and Capacitor's
         shell are served from the root of their origin, so nothing here
         needs the portability relative paths buy. */
      relative: false,
    },
  },
};

export default config;
