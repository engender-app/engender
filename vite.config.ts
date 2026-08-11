import { sveltekit } from '@sveltejs/kit/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { defineConfig } from 'vite';
import sqlocal from 'sqlocal/vite';

export default defineConfig({
  plugins: [
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/lib/paraglide',
      strategy: ['localStorage', 'preferredLanguage', 'baseLocale'],
    }),
    sveltekit(),
    // Handles SQLocal's worker and sets the COOP/COEP headers SQLocal's
    // own docs call for (ticket 04) - but only for the Vite dev server;
    // it has no effect on `vite preview` or on however this gets deployed
    // for real, so production hosting needs to set
    // Cross-Origin-Embedder-Policy: require-corp and
    // Cross-Origin-Opener-Policy: same-origin itself if a target browser
    // turns out to need them. verify-build.mjs's passing run shows this
    // Chromium build doesn't strictly require them for OPFS today, but
    // that's this one browser, not a guarantee across the PRD's supported
    // matrix.
    sqlocal(),
  ],
});
