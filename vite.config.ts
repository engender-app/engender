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
    // own docs call for (ticket 04) - but only for the Vite dev server, so
    // however this gets deployed for real, production hosting has to set
    // Cross-Origin-Embedder-Policy: require-corp and
    // Cross-Origin-Opener-Policy: same-origin itself.
    sqlocal(),
    // `vite preview` is what the walkthrough suite serves the built app
    // from, and it got neither header. Without them this Chromium has no
    // SharedArrayBuffer, SQLocal's worker cannot install its OPFS VFS, and
    // opening the database fails outright with "Value at index 0 does not
    // have a transferable type" - which nothing caught while no screen
    // read from the database. Ticket 06 puts preferences in there, so the
    // preview server needs the headers the dev server already had.
    {
      name: 'gender-diary:cross-origin-isolate-preview',
      configurePreviewServer(server) {
        server.middlewares.use((_req, res, next) => {
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
          next();
        });
      }
    },
  ],
});
