/* Ticket 04's update rule, against a real browser's service-worker
   lifecycle.

   The Node tier drives the decision against a fake registration
   (src/lib/pwa/update.test.ts). What only a browser can answer is whether
   the decision holds when the lifecycle is real: whether a second release
   genuinely installs and waits behind the first, whether a waiting worker
   left unasked really does stay put through an attempt to apply it, and
   whether asking it - once the journal is idle - actually ends with the new
   worker in control of this page.

   Two things here are the tier's rather than the app's. The worker is
   /update-sw.js, served with a generation number the dev server changes on
   demand (browser-tier.vite.config.ts), because the app's own worker only
   exists after a build; it imports the skip-waiting listener from the app's
   source, so the message being honoured is the shipped one. And `reload` is
   recorded instead of performed, since a probe that reloaded would throw its
   own results away - everything below it, skipWaiting and controllerchange
   included, is the browser doing the real thing. */

import { enterWriteInFlight } from '../../src/lib/pwa/writes-in-flight.ts';
import { applyUpdate, updateReady, watchForUpdates } from '../../src/lib/pwa/update.ts';

/** Resolves once a worker is sitting in `waiting`, which is where a release
    that has finished installing goes while another one still controls the
    page. */
async function waitForWaiting(registration: ServiceWorkerRegistration): Promise<boolean> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (registration.waiting) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

/** Long enough for an activation to have happened if one was going to. There
    is no event for "nothing took over", so the absence has to be waited out. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 600));

async function run() {
  for (const registration of await navigator.serviceWorker.getRegistrations()) {
    await registration.unregister();
  }

  let reloads = 0;
  const registration = await navigator.serviceWorker.register('/update-sw.js', {
    type: 'module',
    updateViaCache: 'none'
  });
  await navigator.serviceWorker.ready;
  /* The first release has to be controlling this page before a second one has
     anything to wait behind: with no controller, a new worker activates the
     moment it installs. The fixture claims this page on activate to get there
     (browser-tier.vite.config.ts says why), which is a claim arriving rather
     than an event this page can subscribe to in time. */
  for (let attempt = 0; attempt < 100 && !navigator.serviceWorker.controller; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const firstWorker = navigator.serviceWorker.controller;
  if (!firstWorker) throw new Error('the first release never took control of the page');

  watchForUpdates(registration, {
    onControllerChange: (listener) => navigator.serviceWorker.addEventListener('controllerchange', listener),
    reload: () => {
      reloads++;
    }
  });

  /* A write in flight before the release arrives: an entry save, a migration,
     an encryption conversion or an Archive import, as far as this guard is
     concerned. */
  const saving = enterWriteInFlight();

  await fetch('/update-sw-bump');
  await registration.update();
  const secondReleaseWaiting = await waitForWaiting(registration);

  const offeredWhileBlocked = updateReady();
  const appliedWhileBlocked = await applyUpdate();
  await settle();
  const stillWaitingAfterBlockedAttempt = registration.waiting !== null;
  const controllerUnchanged = navigator.serviceWorker.controller === firstWorker;
  const reloadsWhileBlocked = reloads;

  // The journal goes idle. Nothing else happens: no event, no reload, no tap.
  saving();
  const offeredOnceIdle = updateReady();

  const appliedWhenIdle = await applyUpdate();
  const reloadsWhenIdle = reloads;
  const controllerChanged = navigator.serviceWorker.controller !== firstWorker;
  const nothingLeftWaiting = registration.waiting === null;

  return {
    secondReleaseWaiting,
    offeredWhileBlocked,
    appliedWhileBlocked,
    stillWaitingAfterBlockedAttempt,
    controllerUnchanged,
    reloadsWhileBlocked,
    offeredOnceIdle,
    appliedWhenIdle,
    reloadsWhenIdle,
    controllerChanged,
    nothingLeftWaiting
  };
}

run()
  .then((result) => {
    (window as unknown as Record<string, unknown>).__updateProbeResult = result;
  })
  .catch((error) => {
    (window as unknown as Record<string, unknown>).__updateProbeResult = {
      error: String((error as Error)?.message ?? error)
    };
  })
  .finally(() => {
    document.body.setAttribute('data-update-probe-ready', '');
  });
