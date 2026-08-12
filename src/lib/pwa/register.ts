import { dev } from '$app/environment';
import { base } from '$app/paths';

/** Installs the offline shell (phase 2 ticket 03), which is also what makes
    the app installable: without a worker Chromium offers no install prompt.

    Not in development, where the precached shell would be served ahead of
    every edit and no change would reach the browser until the worker was
    unregistered by hand. */
export function registerServiceWorker() {
  if (dev || !('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register(`${base}/service-worker.js`, { updateViaCache: 'none' }).catch(() => {
    /* A worker that will not register - a browser setting, a private window,
       an origin without HTTPS - leaves an app that needs the network to
       start. Nothing about the journal itself changes, and there is nothing
       to tell the user that they could act on. */
  });
}
