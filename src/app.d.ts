declare global {
  namespace App {}

  /* Injected as a literal by vite.config.ts: true under `vite dev` and in a
     build only when VITE_DEMO=1 asked for the Alice persona. A literal
     rather than an imported const so Rollup folds `if (__DEMO__)` away and
     drops the demo module from a production bundle entirely (ticket 05);
     tests/browser-tier/verify-build.mjs checks that it did. */
  const __DEMO__: boolean;
}

export {};
