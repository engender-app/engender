/* When a new release is allowed to take over (ticket 04, and the decision
   ADR-0021 deliberately left to it).

   The worker installs a new release quietly and then waits. Left alone the
   browser would activate it whenever the last page using the old one goes
   away, which is safe but can be weeks for an installed app that is never
   fully closed. So the app asks - and the rule for when it may ask is the
   whole point of this module:

     - never while the journal is busy. A write, a migration, an encryption
       conversion or an Archive import in flight means the code must not be
       swapped, so nothing is offered and nothing is sent
       (writes-in-flight.ts).
     - only when a person acts. There is no timer and no automatic apply: a
       reload the person did not ask for is an interruption whatever the
       journal is doing.

   That is also why the notice can appear on its own but never disappear into
   an update: going idle is allowed to offer, and only a tap applies.

   Rune-free, so the browser tier can drive it without the Svelte plugin
   (tests/browser-tier/update-probe.ts) and the Node tier can drive its
   decisions against a fake registration. UpdateNotice.svelte is the reactive
   half, over onUpdateReadyChange. */

import { SKIP_WAITING } from './sw-messages';
import { onWriteInFlightChange, writeInFlight } from './writes-in-flight';

/** Just enough of ServiceWorkerRegistration for this. `waiting` is read
    afresh every time rather than remembered, so the browser stays the single
    source of truth for whether a release is there. */
export interface WatchedRegistration {
  readonly waiting: { postMessage(message: unknown): void } | null;
  /** The release currently being fetched and precached, if any. */
  readonly installing: InstallingWorker | null;
  /** Re-fetches the worker script from the origin. */
  update(): Promise<unknown>;
  addEventListener(type: 'updatefound', listener: () => void): void;
}

interface InstallingWorker {
  readonly state: string;
  addEventListener(type: 'statechange', listener: () => void): void;
}

/** What only a real page can do, injected so both test tiers can stand in
    for it. */
export interface UpdateEnvironment {
  /** Calls back when a worker has taken control of this page. */
  onControllerChange(listener: () => void): void;
  /** Starts the release that just took control. */
  reload(): void;
}

let watched: WatchedRegistration | null = null;
let environment: UpdateEnvironment | null = null;
let offered = false;
const listeners = new Set<(ready: boolean) => void>();
let stopWatchingWrites: (() => void) | null = null;

/** True when a new release is installed and waiting and the journal is idle -
    which is exactly when the update action may be on screen. */
export function updateReady(): boolean {
  return watched?.waiting != null && !writeInFlight();
}

/** Called on the edges of that answer. Returns the way to stop listening. */
export function onUpdateReadyChange(listener: (ready: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function reconsider(): void {
  const ready = updateReady();
  if (ready === offered) return;
  offered = ready;
  for (const listener of listeners) listener(ready);
}

/** Watches one registration. Called once by register.ts after the worker is
    registered; calling it again replaces what is watched, which is what lets
    each test start from nothing. */
export function watchForUpdates(registration: WatchedRegistration, updateEnvironment: UpdateEnvironment): void {
  stopWatchingWrites?.();
  watched = registration;
  environment = updateEnvironment;
  offered = false;

  /* A release that installed before this page existed is already sitting in
     `waiting` and no event is coming for it, so the answer is worked out now
     as well as on every later change. */
  registration.addEventListener('updatefound', reconsider);
  stopWatchingWrites = onWriteInFlightChange(reconsider);
  reconsider();
}

/** Goes and asks the origin whether there is a newer release, and reports
    whether one is now waiting and could be applied.

    What the rollback-refusal screen offers (ticket 04): older code has met a
    Journal a newer build already migrated, and the way out is to get that
    build back. The commonest cause is a service worker that is still serving
    the old release, which is precisely what this fixes; when the origin itself
    has been rolled back there is nothing newer to find, and false says so.

    Waits for the install to finish, because `waiting` is empty until it does -
    returning early would report "nothing newer" about a release that was
    downloading at the time. */
export async function checkForNewerRelease(): Promise<boolean> {
  const registration = watched;
  if (!registration) return false;

  await registration.update().catch(() => {});
  const installing = registration.installing;
  if (installing && installing.state === 'installing') {
    await new Promise<void>((resolve) => {
      installing.addEventListener('statechange', () => {
        // Anything but 'installing' is an answer: 'installed' is the release
        // arriving, 'redundant' is an install that failed.
        if (installing.state !== 'installing') resolve();
      });
    });
  }

  reconsider();
  return registration.waiting != null;
}

/** Hands the app over to the waiting release: asks it to stop waiting, then
    reloads once it has taken control. Resolves false, having done nothing, if
    there is nothing waiting or the journal turned out to be busy after all -
    a quick log saved in the same moment as the tap is enough for that, and
    the save is the thing that must not be interrupted.

    Reloading only after `controllerchange` matters: reload first and the old
    worker is still in charge, so the page comes back on the old release and
    the notice with it. */
export async function applyUpdate(): Promise<boolean> {
  const waiting = watched?.waiting;
  if (!waiting || !environment || writeInFlight()) return false;

  const env = environment;
  const controlChanged = new Promise<void>((resolve) => env.onControllerChange(() => resolve()));
  waiting.postMessage(SKIP_WAITING);
  await controlChanged;
  env.reload();
  return true;
}
