/* When the app is allowed to ask a waiting worker to take over (ticket 04).
   The decision is all that is tested here; that a real browser then does
   activate the new release is tests/browser-tier/update-probe.ts. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { markJournalBusy } from '../data/journal-busy.ts';
import { SKIP_WAITING } from './sw-messages.ts';
import {
  applyUpdate,
  checkForNewerRelease,
  onUpdateReadyChange,
  updateReady,
  watchForUpdates,
  type WatchedRegistration
} from './update.ts';

/** A registration whose waiting worker can be put there by hand, the way the
    browser puts one there once a new release has finished installing. */
function fakeRegistration(options: { onUpdate?: () => void } = {}) {
  const posted: unknown[] = [];
  const listeners: (() => void)[] = [];
  const registration = {
    waiting: null as { postMessage(message: unknown): void } | null,
    installing: null as { state: string; addEventListener(type: 'statechange', l: () => void): void } | null,
    async update() {
      options.onUpdate?.();
    },
    addEventListener(_type: 'updatefound', listener: () => void) {
      listeners.push(listener);
    }
  };

  /** What the browser does when a new release has installed behind the
      running one: a worker appears in `waiting` and updatefound has fired. */
  const releaseArrives = () => {
    registration.installing = null;
    registration.waiting = { postMessage: (message: unknown) => posted.push(message) };
    for (const listener of listeners) listener();
  };

  return {
    registration: registration as unknown as WatchedRegistration,
    posted,
    releaseArrives,
    /** And what it does while one is still downloading: a worker in
        `installing`, and `waiting` still empty. */
    releaseStartsInstalling() {
      const stateListeners: (() => void)[] = [];
      const installing = {
        state: 'installing',
        addEventListener: (_type: 'statechange', listener: () => void) => stateListeners.push(listener)
      };
      registration.installing = installing;
      const reachState = (state: string) => {
        installing.state = state;
        for (const listener of stateListeners) listener();
      };
      return {
        finishes() {
          releaseArrives();
          reachState('installed');
        },
        fails() {
          registration.installing = null;
          reachState('redundant');
        }
      };
    }
  };
}

function fakeEnvironment() {
  const changed: (() => void)[] = [];
  let reloads = 0;
  return {
    environment: {
      onControllerChange: (listener: () => void) => changed.push(listener),
      reload: () => {
        reloads++;
      }
    },
    /** What the browser does once the new worker has taken over the page. */
    takesControl: () => changed.forEach((listener) => listener()),
    reloads: () => reloads
  };
}

test('nothing is offered before a release is waiting', () => {
  const { registration } = fakeRegistration();
  const { environment } = fakeEnvironment();

  watchForUpdates(registration, environment);

  assert.equal(updateReady(), false);
});

test('a waiting release is offered while the journal is idle', () => {
  const worker = fakeRegistration();
  const { environment } = fakeEnvironment();
  watchForUpdates(worker.registration, environment);

  worker.releaseArrives();

  assert.equal(updateReady(), true);
});

test('a release waiting when the page loads is found without an updatefound', () => {
  // The ordinary case for a second tab, or for any load after the release
  // installed: the worker is already sitting in `waiting` and no event is
  // coming, because it arrived before this page existed.
  const worker = fakeRegistration();
  const { environment } = fakeEnvironment();
  worker.releaseArrives();

  watchForUpdates(worker.registration, environment);

  assert.equal(updateReady(), true);
});

test('a write in flight takes the offer off the screen', () => {
  const worker = fakeRegistration();
  const { environment } = fakeEnvironment();
  watchForUpdates(worker.registration, environment);
  const saving = markJournalBusy();

  worker.releaseArrives();

  assert.equal(updateReady(), false, 'nothing may be offered while a write, migration or conversion is running');
  saving();
});

test('the offer appears by itself once the write lands', () => {
  const worker = fakeRegistration();
  const { environment } = fakeEnvironment();
  watchForUpdates(worker.registration, environment);
  const saving = markJournalBusy();
  worker.releaseArrives();

  saving();

  // The acceptance wording: offered once the current operation is idle. Not
  // offered during it, and not withheld until something else happens.
  assert.equal(updateReady(), true);
});

test('applying a waiting release asks it to take over and reloads once it has', async () => {
  const worker = fakeRegistration();
  const env = fakeEnvironment();
  watchForUpdates(worker.registration, env.environment);
  worker.releaseArrives();

  const applied = applyUpdate();

  assert.deepEqual(worker.posted, [SKIP_WAITING]);
  assert.equal(env.reloads(), 0, 'reloading before the new worker has control would just re-run the old one');
  env.takesControl();
  assert.equal(await applied, true);
  assert.equal(env.reloads(), 1);
});

test('a write that starts between the tap and the handler cancels the update', async () => {
  const worker = fakeRegistration();
  const env = fakeEnvironment();
  watchForUpdates(worker.registration, env.environment);
  worker.releaseArrives();
  // A quick log saved from Home in the same tick as the tap. The offer was
  // honestly on screen a moment ago; acting on it now would interrupt.
  const saving = markJournalBusy();

  const applied = await applyUpdate();

  assert.equal(applied, false);
  assert.deepEqual(worker.posted, [], 'no skip-waiting message may reach the worker');
  assert.equal(env.reloads(), 0);
  saving();
});

test('applying nothing is refused rather than reloading for no reason', async () => {
  const worker = fakeRegistration();
  const env = fakeEnvironment();
  watchForUpdates(worker.registration, env.environment);

  assert.equal(await applyUpdate(), false);
  assert.equal(env.reloads(), 0);
});

/* The rollback-refusal screen's way out (ticket 04): older code has met a
   newer Journal, and what fixes it is getting the newer release back. */

test('looking for a newer release finds one that arrives while it waits', async () => {
  let installing: { finishes(): void; fails(): void };
  const worker = fakeRegistration({ onUpdate: () => (installing = worker.releaseStartsInstalling()) });
  const { environment } = fakeEnvironment();
  watchForUpdates(worker.registration, environment);

  const looking = checkForNewerRelease();
  installing!.finishes();

  assert.equal(await looking, true, 'a release still downloading when the check ran is not "nothing newer"');
  assert.equal(updateReady(), true, 'and the offer is on screen without waiting for another event');
});

test('an install that fails is reported as nothing newer, not as a release', async () => {
  let installing: { finishes(): void; fails(): void };
  const worker = fakeRegistration({ onUpdate: () => (installing = worker.releaseStartsInstalling()) });
  const { environment } = fakeEnvironment();
  watchForUpdates(worker.registration, environment);

  const looking = checkForNewerRelease();
  installing!.fails();

  assert.equal(await looking, false);
});

test('an origin with nothing newer says so rather than hanging', async () => {
  // The other half of the rollback case: the origin itself went back a
  // release, so there is no newer code to be had and the screen has to say
  // that instead of spinning.
  const worker = fakeRegistration();
  const { environment } = fakeEnvironment();
  watchForUpdates(worker.registration, environment);

  assert.equal(await checkForNewerRelease(), false);
});

test('a listener hears the offer arrive, and not before', () => {
  const worker = fakeRegistration();
  const { environment } = fakeEnvironment();
  const heard: boolean[] = [];
  watchForUpdates(worker.registration, environment);
  const stop = onUpdateReadyChange((ready) => heard.push(ready));

  const saving = markJournalBusy();
  worker.releaseArrives();
  saving();

  assert.deepEqual(heard, [true], 'nothing while busy, one notice when the journal goes idle');
  stop();
});
