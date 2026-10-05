import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { sveltekit } from '@sveltejs/kit/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { defineConfig, type Plugin } from 'vite';
import sqlocal from 'sqlocal/vite';
import { appVersion } from './scripts/app-version.mjs';
import { lockfilePackages } from './scripts/check-licences.mjs';
import { noticesFromDisk, packagePathOf } from './scripts/licence-notices.mjs';
import capacitorConfig from './capacitor.config';

/* What the client build actually emitted, written where src/service-worker.ts
   can import it - the shell cannot be precached from SvelteKit's own `build`
   list, which omits SQLocal's worker and the worker's copy of the SQLite
   WASM. verify-build.mjs fails if anything the build wrote is missing from
   the cache the worker fills. */
const GENERATED = 'src/lib/pwa/emitted-client-assets.generated.ts';

function demoWorkerPrewarm(): Plugin {
  let client = false;
  let entry: string | undefined;
  return {
    name: 'engender:demo-worker-prewarm',
    configResolved(config) {
      client = config.build.outDir.endsWith('/client');
    },
    buildStart() {
      if (client && process.env.VITE_DEMO === '1') {
        entry = this.emitFile({ type: 'chunk', id: 'src/lib/data/demo/prewarm.ts', name: 'demo-prewarm' });
      }
    },
    outputOptions(options) {
      if (!client || process.env.VITE_DEMO !== '1') return;
      const reachable = (roots: string[]) => {
        const modules = new Set<string>();
        const visit = (id: string) => {
          if (modules.has(id)) return;
          modules.add(id);
          for (const dependency of this.getModuleInfo(id)?.importedIds ?? []) visit(dependency);
        };
        for (const root of roots) visit(root);
        return modules;
      };
      let startup: Set<string> | undefined;
      let bootstrap: Set<string> | undefined;
      options.onlyExplicitManualChunks = true;
      options.manualChunks = (id) => {
        if (!startup) {
          const ids = [...this.getModuleIds()];
          startup = reachable(ids.filter((module) =>
            module.endsWith('/src/routes/+layout.svelte') || module.endsWith('/src/routes/+page.svelte')
          ));
          // Keep the early worker owner small while the screen bundle loads.
          bootstrap = reachable(ids.filter((module) =>
            module.endsWith('/src/lib/data/demo/prewarm.ts') ||
            module.endsWith('/src/lib/data/sqlite/mc-driver.ts') ||
            module.endsWith('/src/lib/data/conversion/plaintext-journal.ts') ||
            module.endsWith('/src/lib/platform.ts')
          ));
          for (const module of bootstrap) startup.delete(module);
          for (const module of bootstrap) {
            if (module.endsWith('/src/lib/data/demo/prewarm.ts')) bootstrap.delete(module);
          }
          // The catalogue barrel imports copy used by other routes too.
          for (const module of startup) {
            if (module.includes('/src/lib/paraglide/')) startup.delete(module);
          }
        }
        if (bootstrap!.has(id)) return 'demo-worker-bootstrap';
        return startup.has(id) ? 'demo-startup' : undefined;
      };
    },
    writeBundle() {
      if (entry) writeFileSync('.svelte-kit/demo-prewarm.json', JSON.stringify(this.getFileName(entry)));
    }
  };
}

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

/* One copy of each WASM file in the build (phase 14 pre-release ticket 13).

   SvelteKit names an asset `assets/[name].[hash][ext]` in the client bundle
   and `workers/assets/[name]-[hash][ext]` in the worker bundle, so a file
   both import - sqlite3.wasm, once for SQLocal's client and once for its
   worker - was written, precached and stored twice under two names with the
   same bytes (0.4 MB brotli each). Giving the worker bundle the client's
   pattern makes the two emit the same path with the same content, which
   Rollup writes once.

   Only the `.wasm` extension is moved. Everything else a worker emits keeps
   SvelteKit's own directory, so this changes nothing but the duplicate. */
function sharedWasmAssets() {
  return {
    name: 'engender:shared-wasm-assets',
    // After sveltekit(), whose config hook sets the pattern this replaces.
    config() {
      return {
        worker: {
          rollupOptions: {
            output: {
              assetFileNames: (asset: { names?: string[]; name?: string }) => {
                const name = asset.names?.[0] ?? asset.name ?? '';
                return name.endsWith('.wasm')
                  ? '_app/immutable/assets/[name].[hash][extname]'
                  : '_app/immutable/workers/assets/[name]-[hash][extname]';
              }
            }
          }
        }
      };
    }
  };
}

/* The licence notices screen's data (phase 15 release-blockers ticket 10),
   generated from what this build actually bundled.

   /settings/licences imports `virtual:licence-notices`. Which packages
   ship is only known once every module is in, and a module's own code
   cannot wait for that, so the module is a placeholder string while the
   graph builds, and the notices replace it as its chunk is rendered - by
   which point the client graph is complete and every worker bundle, built
   during the client's transform phase, has reported its modules through
   the worker half of this plugin. Rendering happens before hashing, so the
   chunk's name still follows its content.

   A bundled package that cannot be given a complete notice fails the
   client build: that is the check that every shipped package appears in
   the notices. Under `vite dev` there is no bundle to read, so the screen
   shows the lockfile's runtime dependencies instead. */
const NOTICES_ID = 'virtual:licence-notices';
const NOTICES_PLACEHOLDER = '__ENGENDER_LICENCE_NOTICES__';

function licenceNotices() {
  const workerModules = new Set<string>();
  let serving = false;
  let client = false;
  let server = false;
  let rendered: string | undefined;

  const worker: Plugin = {
    name: 'engender:licence-notices-worker',
    generateBundle() {
      for (const id of this.getModuleIds()) workerModules.add(id);
    }
  };

  const main: Plugin = {
    name: 'engender:licence-notices',
    configResolved(config) {
      serving = config.command === 'serve';
      client = config.build.outDir.endsWith('/client');
      server = config.build.outDir.endsWith('/server');
    },
    buildStart() {
      rendered = undefined;
    },
    resolveId(id) {
      return id === NOTICES_ID ? `\0${NOTICES_ID}` : undefined;
    },
    load(id) {
      if (id !== `\0${NOTICES_ID}`) return;
      if (serving) {
        const runtime = lockfilePackages('.').filter((entry) => !entry.dev);
        const { notices } = noticesFromDisk('.', runtime.map((entry) => entry.path));
        return `export default ${JSON.stringify(notices)};`;
      }
      return `export default JSON.parse(${JSON.stringify(NOTICES_PLACEHOLDER)});`;
    },
    renderChunk(code) {
      if (!code.includes(NOTICES_PLACEHOLDER)) return;
      if (rendered === undefined) {
        if (client) {
          const shipped = [...this.getModuleIds(), ...workerModules].map(packagePathOf).filter((path) => path !== null);
          const { notices, problems } = noticesFromDisk('.', shipped);
          if (problems.length) this.error(`Licence notices are incomplete:\n${problems.join('\n')}`);
          rendered = JSON.stringify(notices);
        } else if (server) {
          // The prerender's copy, which no browser ever loads.
          rendered = JSON.stringify({ texts: [], sections: [] });
        } else {
          // A third kind of build would ship empty notices without a word.
          this.error('Licence notices: a build that is neither the client nor the server renders them');
        }
      }
      // Whatever quotes the minifier chose, the placeholder is one string
      // literal. A function, so a `$&` inside a licence text stays literal.
      const literal = new RegExp(`(["'\`])${NOTICES_PLACEHOLDER}\\1`, 'g');
      const out = code.replace(literal, () => JSON.stringify(rendered));
      if (out.includes(NOTICES_PLACEHOLDER)) this.error('Licence notices: the placeholder survived rendering');
      return out;
    }
  };

  return { main, worker };
}

/* One pair per build: each build loads this config afresh, so the worker
   bundles of one client build report into that build's set and no other. */
const notices = licenceNotices();

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
  worker: { plugins: () => [notices.worker] },
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
    demoWorkerPrewarm(),
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
    sharedWasmAssets(),
    notices.main,
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
