import { dev } from '$app/environment';
import { base } from '$app/paths';
import { isAndroid } from '$lib/platform';
import { SHELL_CACHE_PREFIX } from './shell-assets';
import { watchForUpdates } from './update';

/** Installs the offline shell (phase 2 ticket 03), which is also what makes
    the app installable: without a worker Chromium offers no install prompt.
    Then watches for the next release (ticket 04).

    Not in development, where the precached shell would be served ahead of
    every edit and no change would reach the browser until the worker was
    unregistered by hand.

    Not on Android either (phase 5 performance ticket 01). Neither half of what
    this does has a job there: every asset the WebView loads is already a local
    file inside the APK, so there is no offline shell to build, and a new
    release arrives as an APK rather than as a worker script, so there is no
    update to watch for. Registering anyway copied about 50 MB of the app's own
    assets into WebView cache storage - a second copy of what was already on
    the device. */
export function registerServiceWorker() {
  if (dev || !('serviceWorker' in navigator)) return;
  if (isAndroid()) return void removeAndroidServiceWorker();

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

/** Undoes an install made before the rule above existed. Leaving that worker
    in place would be worse than the storage it wastes: it goes on answering
    navigations from the release it precached, so the WebView would keep
    showing the old app after an APK update had replaced the assets underneath
    it. Its caches go with it, and they are the ~50 MB second copy of the APK's
    own assets that this early return exists to stop making.

    A no-op on an install that never had one, which is every install from here.
    Nothing is awaited or reported: a WebView that will not give up its worker
    is not something a person can act on, and the app opens either way. */
function removeAndroidServiceWorker() {
  void navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
    .catch(() => {});

  /* Only this app's own caches, by the same prefix the worker deletes by:
     another key on this origin would belong to something that is not ours. */
  if (typeof caches === 'undefined') return;
  void caches
    .keys()
    .then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith(SHELL_CACHE_PREFIX)).map((key) => caches.delete(key)))
    )
    .catch(() => {});
}
