declare global {
  namespace App {}

  /* Injected as a literal by vite.config.ts: true under `vite dev` and in a
     build only when VITE_DEMO=1 asked for the Alice persona. A literal
     rather than an imported const so Rollup folds `if (__DEMO__)` away and
     drops the demo module from a production bundle entirely (ticket 05);
     tests/browser-tier/verify-build.mjs checks that it did. */
  const __DEMO__: boolean;

  /* The public version name this build was given, injected as a literal by
     vite.config.ts from the signed version tag (ticket 01). A development
     build carries a 0.0.0-dev name that says which commit it came from, so
     nothing here can be mistaken for a release. */
  const __APP_VERSION__: string;
}

export {};
