/* Offer a waiting service worker only while the journal is idle
   (ADR-0021). Writes, migrations, encryption conversions and Archive
   imports must finish before code swaps. Only a user action applies an
   update, so going idle may show the notice but never reload the app.

   Keep this module rune-free for browser and Node probes.
   UpdateNotice.svelte owns the reactive display. */

import { SKIP_WAITING } from './sw-messages';
import { onJournalBusyChange, journalIsBusy, prepareJournalHandover } from '../data/journal-busy';

/** Just enough of ServiceWorkerRegistration for this. `waiting` is read
    afresh every time rather than remembered, so the browser stays the single
    source of truth for whether a release is there. */
/* WatchedRegistration stays exported only for its own test. */
export interface WatchedRegistration {
  /** The release this page runs on; null until a first install activates. */
  readonly active: object | null;
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
  removeEventListener(type: 'statechange', listener: () => void): void;
}

/** What only a real page can do, injected so both test tiers can stand in
    for it. */
interface UpdateEnvironment {
  /** Calls back when a worker has taken control of this page. */
  onControllerChange(listener: () => void): (() => void) | void;
  /** Starts the release that just took control. */
  reload(): void;
}

/** How long a skip-waiting message is given to end in this page being
    controlled by the new worker. Generous, because it covers an activate
    handler doing work; short enough that a person is not left looking at a
    disabled button. */
const TAKEOVER_LIMIT_MS = 5000;
const INSTALL_LIMIT_MS = 30_000;

let watched: WatchedRegistration | null = null;
let environment: UpdateEnvironment | null = null;
let offered = false;
let applying = false;
let pendingReload = false;
const listeners = new Set<(ready: boolean) => void>();
let stopWatchingWrites: (() => void) | null = null;

/** True when a new release is installed and waiting and the journal is idle -
    which is exactly when the update action may be on screen.

    Waiting behind an active release, that is. A first install passes through
    `waiting` too: the browser reports it 'installed' and only then activates
    it, because nothing is running for it to wait behind. Offered at that
    moment, the notice stayed for the whole visit with nothing to apply. */
export function updateReady(): boolean {
  return (pendingReload || (watched?.waiting != null && watched.active != null)) && !applying && !journalIsBusy();
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
  pendingReload = false;
  offered = false;

  /* A release that installed before this page existed is already sitting in
     `waiting` and no event is coming for it, so the answer is worked out now
     as well as on every later change. */
  const watchInstalling = () => {
    if (watched !== registration) return;
    const installing = registration.installing;
    if (installing) {
      const changed = () => {
        if (installing.state === 'installing') return;
        installing.removeEventListener('statechange', changed);
        if (watched === registration) reconsider();
      };
      installing.addEventListener('statechange', changed);
      changed();
    }
    reconsider();
  };
  registration.addEventListener('updatefound', watchInstalling);
  watchInstalling();
  stopWatchingWrites = onJournalBusyChange(reconsider);
  reconsider();
}

/** Goes and asks the origin whether there is a newer release, and reports
    whether one is now waiting and could be applied.

    What the rollback-refusal screen offers: older code has met a
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

  await registration.update().catch((error) => {
    // An installed release can still recover this page while offline.
    if (!registration.waiting) throw error;
  });
  const installing = registration.installing;
  if (installing && installing.state === 'installing') {
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        installing.removeEventListener('statechange', changed);
        resolve();
      };
      const changed = () => {
        if (installing.state !== 'installing') done();
      };
      const timer = setTimeout(done, INSTALL_LIMIT_MS);
      installing.addEventListener('statechange', changed);
      changed();
    });
  }

  reconsider();
  return registration.waiting != null;
}

/** Ask the waiting worker to activate unless the journal is busy.
    Wait for `controllerchange` before reloading so the new release
    serves the page. Bound the wait for a worker that never takes over.

    Wait for journal writes after takeover or timeout. A failed write
    cancels the reload so recovery stays available. A later tap can
    finish it even if the worker has already taken control. */
export async function applyUpdate(): Promise<boolean> {
  const waiting = watched?.waiting;
  if ((!waiting && !pendingReload) || !environment || applying || journalIsBusy()) return false;

  const env = environment;
  const handover = prepareJournalHandover();
  applying = true;
  reconsider();
  try {
    if (!pendingReload) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let takenControl!: () => void;
      const controlChanged = new Promise<void>((resolve) => { takenControl = resolve; });
      const stopControllerChange = env.onControllerChange(takenControl);
      try {
        waiting!.postMessage(SKIP_WAITING);
        await Promise.race([
          controlChanged,
          new Promise<void>((resolve) => { timer = setTimeout(resolve, TAKEOVER_LIMIT_MS); })
        ]);
        pendingReload = true;
      } finally {
        clearTimeout(timer);
        stopControllerChange?.();
      }
    }
    return await handover(() => env.reload());
  } catch {
    return false;
  } finally {
    applying = false;
    reconsider();
  }
}
