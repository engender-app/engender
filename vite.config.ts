import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { sveltekit } from '@sveltejs/kit/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { defineConfig } from 'vite';
import sqlocal from 'sqlocal/vite';
import { appVersion } from './scripts/app-version.mjs';
import capacitorConfig from './capacitor.config';

/* What the client build actually emitted, written where src/service-worker.ts
   can import it - the shell cannot be precached from SvelteKit's own `build`
   list, which omits SQLocal's worker and the worker's copy of the SQLite
   WASM. verify-build.mjs fails if anything the build wrote is missing from
   the cache the worker fills. */
const GENERATED = 'src/lib/pwa/emitted-client-assets.generated.ts';

function writeEmittedClientAssets() {
  const write = (assets: string[]) => {
    mkdirSync('src/lib/pwa', { recursive: true });
    writeFileSync(
      GENERATED,
      `/* Written by the engender:emitted-client-assets plugin in\n` +
        `   vite.config.ts on every build. Not handwritten, not committed. */\n` +
        `export const emittedClientAssets = ${JSON.stringify(assets, null, 2)};\n`
    );
  };

  return {
    name: 'engender:emitted-client-assets',
    /* Only when there is nothing there at all, so that `npm run dev` and a
       fresh clone have a module to resolve - never over a real list, because
       three builds run through this config and the client one is not last. */
    buildStart() {
      if (!existsSync(GENERATED)) write([]);
    },
    writeBundle: {
      // After Vite's own manifest plugin, and before SvelteKit reads the
      // client build and goes on to build the service worker from it.
      order: 'post' as const,
      handler(options: { dir?: string }, bundle: Record<string, unknown>) {
        // SvelteKit runs three builds through this config - server, client,
        // service worker - and only the client one emits the app's assets.
        // Its output directory is the thing that says which is which.
        if (!options.dir?.endsWith('/client')) return;
        write(
          Object.keys(bundle)
            .filter((file) => file.startsWith('_app/immutable/'))
            .map((file) => `/${file}`)
            .sort()
        );
      }
    }
  };
}

/* The syntax floor, taken from the number the Android shell refuses to run
   below rather than written down twice.

   87 was Vite's own default module target,
   inherited rather than chosen, so a Vite upgrade that moved it would have
   moved what the app runs on with nobody deciding to - and the number in
   capacitor.config.ts would have gone on claiming the old one. Deriving it
   from that number is what keeps the two from drifting apart at all.

   The other four are Vite's default list unchanged. This app ships to a
   browser as well as into a WebView, and dropping them would let esbuild
   emit something Safari 14 cannot read the moment Chrome is the only name
   here. */
const { minWebViewVersion } = capacitorConfig.android ?? {};
if (!minWebViewVersion) throw new Error('capacitor.config.ts names no minWebViewVersion to compile the bundle to');
const BUILD_TARGET = ['es2020', 'edge88', `chrome${minWebViewVersion}`, 'firefox78', 'safari14'];

export default defineConfig(({ command }) => ({
  build: { target: BUILD_TARGET },
  // A literal, not an exported const, so Rollup can fold `if (__DEMO__)`
  // and drop the Alice persona and the demo bar from a production bundle
  // rather than shipping them behind a runtime flag. True while developing,
  // and in a build only when VITE_DEMO=1 asks for it - which is what
  // `npm run test:walkthrough` does, since the walkthrough drives the
  // persona and the demo bar's jump control.
  //
  // __APP_VERSION__ is the same literal treatment, for the reason the release
  // contract needs rather than the one Rollup needs: the version
  // the build was given has to be inside the bundle it built, so the About
  // screen can only ever show what was actually shipped. Read once here, from
  // the signed tag or from ENGENDER_VERSION, and nowhere else.
  define: {
    __DEMO__: JSON.stringify(command === 'serve' || process.env.VITE_DEMO === '1'),
    __APP_VERSION__: JSON.stringify(appVersion())
  },
  // Pre-bundling would inline the sqlite3mc wasm module in a way that
  // breaks its URL-relative sqlite3.wasm loading inside mc-worker.ts.
  // Build output is unaffected; this is dev-server only.
  optimizeDeps: {
    exclude: ['@evolu/sqlite-wasm']
  },
  plugins: [
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/lib/paraglide',
      strategy: ['localStorage', 'preferredLanguage', 'baseLocale'],
    }),
    sveltekit(),
    // Handles SQLocal's worker and sets the COOP/COEP headers SQLocal's
    // own docs call for - but only for the Vite dev server, so
    // however this gets deployed for real, production hosting has to set
    // Cross-Origin-Embedder-Policy: require-corp and
    // Cross-Origin-Opener-Policy: same-origin itself.
    sqlocal(),
    writeEmittedClientAssets(),
    // `vite preview` is what the walkthrough suite serves the built app
    // from, and it got neither header. Without them this Chromium has no
    // SharedArrayBuffer, SQLocal's worker cannot install its OPFS VFS, and
    // opening the database fails outright with "Value at index 0 does not
    // have a transferable type" - which nothing caught while no screen
    // read from the database. Now that preferences live there too, the
    // preview server needs the headers the dev server already had.
    {
      name: 'engender:cross-origin-isolate-preview',
      configurePreviewServer(server) {
        server.middlewares.use((_req, res, next) => {
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
          next();
        });
      }
    },
  ],
}));
