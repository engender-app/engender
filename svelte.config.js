import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // SPA: one static bundle, no SSR, no server — Capacitor wraps it unchanged.
    adapter: adapter({ fallback: 'index.html' }),
  },
};

export default config;
