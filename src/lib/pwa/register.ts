import { dev } from '$app/environment';
import { base } from '$app/paths';
import { watchForUpdates } from './update';

/** Installs the offline shell (phase 2 ticket 03), which is also what makes
    the app installable: without a worker Chromium offers no install prompt.
    Then watches for the next release (ticket 04).

    Not in development, where the precached shell would be served ahead of
    every edit and no change would reach the browser until the worker was
    unregistered by hand. */
export function registerServiceWorker() {
  if (dev || !('serviceWorker' in navigator)) return;

  navigator.serviceWorker
    .register(`${base}/service-worker.js`, { updateViaCache: 'none' })
    .then((registration) => {
      watchForUpdates(registration, {
        onControllerChange: (listener) => navigator.serviceWorker.addEventListener('controllerchange', listener),
        reload: () => location.reload()
      });

      /* An installed app can stay open for days without a navigation, and a
         navigation is the only thing that makes the browser re-fetch the
         worker script on its own - so an app nobody closes would never learn
         that a release exists. Asked on the way back to the tab rather than
         on a timer, because that is the moment a person is about to use the
         app and an update found then is one they can act on. Cheap:
         updateViaCache: 'none' makes it a conditional request for one small
         file, and finding nothing new costs a 304. */
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update().catch(() => {});
      });
    })
    .catch(() => {
      /* A worker that will not register - a browser setting, a private window,
         an origin without HTTPS - leaves an app that needs the network to
         start. Nothing about the journal itself changes, and there is nothing
         to tell the user that they could act on. */
    });
}
