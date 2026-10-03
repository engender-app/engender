/* Build-time only: imported by src/hooks.server.ts, never by the app. The document
   the build writes is what it rewrites, hence the directory name (not build/,
   which .gitignore keeps out of the repo). */

/** The build's module hints, made inert: `rel="modulepreload"` becomes
    `rel="x-modulepreload"`, which the browser ignores, and the pre-paint
    script in app.html gives it back after the first frame has painted.

    Why: the document names 98 modules and six stylesheets, and the browser
    fetches all of them at once over one connection, sharing it out evenly.
    The stylesheets are what a first paint waits for (the largest is 125 KB),
    and they were arriving at 2.5 s because they queued with the modules,
    which nothing waits for yet. Measured on the 4x CPU, 1.6 Mbps, 150 ms
    profile over HTTP/2: first paint 2.4 s with the hints live, 0.7 s with
    them held until after DOMContentLoaded, and the app's own first screen
    no later (3.6 s against 3.4 to 3.9 s) - the same bytes cross the same
    pipe, only in a better order. */
export function holdModulePreloads(html: string): string {
  return html.replaceAll('rel="modulepreload"', 'rel="x-modulepreload"');
}
