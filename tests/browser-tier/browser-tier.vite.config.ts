/* Standalone dev server for the browser-tier probe (ticket 03) - separate
   from the app's own vite.config.ts on purpose, since this only exists to
   serve probe.ts to a real browser over COOP/COEP, and ticket 04 owns
   wiring SQLocal into the app itself. Named so svelte-check's project
   auto-discovery (which globs for vite.config.*) does not pick it up -
   run.mjs loads it explicitly.

   The svelte plugin is here only for `$state`: ticket 22's probe is the
   first one to import a store (videoRecording.ts, by way of toast()), and
   without it a rune reaches the browser unprocessed and throws. This is
   plain @sveltejs/vite-plugin-svelte, not the sveltekit() plugin the app
   config uses - there is no route tree here for it to need. */
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import sqlocal from 'sqlocal/vite';

/* A real service worker whose bytes change on demand (phase 2 ticket 04).

   The app's own worker only exists after `vite build`, which this tier does
   not run - and what the update rule needs to be tested against is not the
   precaching (verify-build.mjs covers that) but the browser's update
   lifecycle: a second release installing behind the first, waiting, and
   activating only when asked. That needs one URL whose response changes,
   which is what /update-sw.js is: same path, a different generation number
   inside it after a GET of /update-sw-bump.

   The skip-waiting listener is imported from the app's own source rather
   than written out here, so the worker under test honours the same message
   as the shipped one and the two cannot drift apart on a string. */
function mutableServiceWorker() {
  const protocolModule = resolve(import.meta.dirname, '../../src/lib/pwa/sw-messages.ts');
  let generation = 1;

  return {
    name: 'gender-diary:mutable-service-worker',
    configureServer(server: {
      middlewares: {
        use(handler: (req: { url?: string }, res: ServerResponse, next: () => void) => void): void;
      };
    }) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0];
        if (path === '/update-sw-bump') {
          generation += 1;
          res.setHeader('Content-Type', 'text/plain');
          res.end(String(generation));
          return;
        }
        if (path !== '/update-sw.js') return next();
        res.setHeader('Content-Type', 'text/javascript');
        // Or the browser answers the update check from its HTTP cache and
        // never sees the new bytes.
        res.setHeader('Cache-Control', 'no-store');
        res.end(
          [
            `import { listenForSkipWaiting } from '/@fs${protocolModule}';`,
            `const GENERATION = ${generation};`,
            'listenForSkipWaiting(self);',
            /* Nothing precached and nothing intercepted: an empty install is
               still a real install, and the fetch handler exists only so the
               worker is one that controls pages at all. */
            "self.addEventListener('fetch', () => {});",
            /* The app's worker deliberately does not claim clients, and this
               one has to, for a reason that is about the fixture rather than
               about the rule: a page that registered a worker mid-load is not
               controlled by it, and a second release behind an uncontrolled
               worker activates at once instead of waiting. Claiming here is
               what gives the probe a controlled page in one load, so there is
               something for release two to wait behind. What is under test is
               release two, which waits or does not on its own account. */
            "self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));",
            'void GENERATION;'
          ].join('\n')
        );
      });
    }
  };
}

interface ServerResponse {
  setHeader(name: string, value: string): void;
  end(body: string): void;
}

export default defineConfig({
  root: import.meta.dirname,
  /* The app's static directory, so the kit gallery (phase 5 ticket 20) draws
     in Nunito and Outfit rather than in whatever the machine's system-ui
     happens to be. Type is half of what that page is reviewed for, and every
     other probe here is unaffected by a few more files being reachable. */
  publicDir: resolve(import.meta.dirname, '../../static'),
  plugins: [svelte(), sqlocal(), mutableServiceWorker()],
  resolve: {
    alias: {
      $lib: resolve(import.meta.dirname, '../../src/lib'),
      /* SvelteKit's own modules, which this tier has no router to provide:
         see app-state-stub.ts and app-navigation-stub.ts. Without the first
         the kit gallery does not mount, because a real kit component imports
         it; without the second no whole screen does, because a screen
         navigates. */
      '$app/state': resolve(import.meta.dirname, 'app-state-stub.ts'),
      '$app/navigation': resolve(import.meta.dirname, 'app-navigation-stub.ts')
    }
  },
  /* The two literals vite.config.ts replaces in the app's own build. The
     entry editor reaches the boot store for the journal's data key, and that
     module reads both - a build flag left undefined is a ReferenceError at
     module scope, not a missing feature. Never a demo here: a fixture states
     its own journal. */
  define: {
    __DEMO__: JSON.stringify(false),
    __APP_VERSION__: JSON.stringify('0.0.0-browser-tier')
  },
  // Same exclusion the app's own config needs (ticket 09): pre-bundling
  // would inline the sqlite3mc wasm module in a way that breaks its own
  // URL-relative wasm loading inside mc-worker.ts.
  optimizeDeps: {
    exclude: ['@evolu/sqlite-wasm']
  }
});
