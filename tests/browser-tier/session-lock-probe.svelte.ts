/* Browser-tier check for after-release ticket 10: a web lock closes the
   real encrypted database and lets go of the key, and the unlock opens it
   again under the same key without losing a write.

   Here rather than in the Node tier for the parts the Node tier cannot
   reach: the sqlite3mc worker over OPFS that the lock terminates, the live
   facade and the reference mirror, which are runes. The session itself is
   the real one (journal-session.ts), wired with the same ports boot.svelte.ts
   gives it, minus what needs the app shell - preferences, the photo stores
   and the paraglide-bound content caches, which journal-session.test.ts
   and forget-content.test.ts cover.

   Also where the reopen is timed, since a lock now puts a database open
   between the derived key and the journal: run.mjs loads this page twice,
   the second time with the CPU throttled. */

import { flushSync } from 'svelte';
import { createEncryptedWebSqlite, prewarmJournalWorker } from '../../src/lib/data/sqlite/mc-driver.ts';
import { boot } from '../../src/lib/data/sqlite/boot.ts';
import { openJournal } from '../../src/lib/data/journal/journal.ts';
import { opfsPhotoFiles } from '../../src/lib/data/photos/opfs-file-store.ts';
import type { SqliteDriver } from '../../src/lib/data/sqlite/driver.ts';
import {
  attachJournal,
  journal,
  journalIsClosing,
  journalIsOpen
} from '../../src/lib/data/live/journal.svelte.ts';
import { forgetReference, hydrateReference, reference } from '../../src/lib/data/live/reference.svelte.ts';
import { sessionDriver } from '../../src/lib/data/live/sessionDriver.ts';
import { journalSession } from '../../src/lib/stores/journal-session.ts';
import { freshOrigin, PROBE_DATA_KEY } from './fresh-origin.ts';

const DATABASE = 'session-lock-probe.sqlite3';

const publish = (value: unknown) => {
  (window as unknown as { __sessionLockProbeResult: unknown }).__sessionLockProbeResult = value;
  document.body.dataset.sessionLockProbeReady = 'true';
};

async function until(settled: () => boolean, what: string): Promise<void> {
  for (let attempt = 0; attempt < 300; attempt++) {
    flushSync();
    if (settled()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${what}`);
}

const settledWithin = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([promise.then(() => true, () => true), new Promise<boolean>((r) => setTimeout(() => r(false), ms))]);

const labels = () => reference.tagGroups.flatMap((group) => group.tags.map((tag) => tag.label));

async function run() {
  await freshOrigin();
  const first = createEncryptedWebSqlite(DATABASE, PROBE_DATA_KEY);
  const booted = await boot({ createDriver: () => first.driver, fileOps: first.fileOps });
  if (booted.phase === 'error') {
    publish({ error: String((booted.error as Error)?.stack ?? booted.error) });
    return;
  }
  const session = journalSession<Uint8Array<ArrayBuffer>, SqliteDriver>({
    suspend: () => journalIsClosing(),
    async open(key) {
      const sqlite = createEncryptedWebSqlite(DATABASE, key);
      try {
        const reopened = attachJournal(openJournal(journalDriver, opfsPhotoFiles()));
        session.connection.open(sqlite.driver);
        await hydrateReference(reopened);
        journalIsOpen();
        return sqlite.driver;
      } catch (error) {
        await sqlite.driver.close().catch(() => {});
        throw error;
      }
    },
    release: () => forgetReference(),
    prewarm: () => {
      prewarmJournalWorker(DATABASE).catch(() => {});
    }
  });
  /* Built over the session's connection as boot.svelte.ts builds it, so a
     handle held across a lock reaches the reopened database. */
  const journalDriver = sessionDriver(session.connection);
  session.connection.open(booted.driver);
  const opened = attachJournal(openJournal(journalDriver, opfsPhotoFiles()));
  await opened.reconcileBuiltIns();
  await hydrateReference(opened);
  journalIsOpen();
  session.adopt(PROBE_DATA_KEY, booted.driver);

  const group = reference.tagGroups[0].key;

  /* A save already on its way when the lock starts. */
  const heldOver = journal.tags.addTag(group, 'held over the lock');
  const lockStarted = performance.now();
  await session.lock();
  const lockMs = performance.now() - lockStarted;
  const heldOverLanded = await settledWithin(heldOver, 0);

  const oldDriverRefuses = await booted.driver.query('SELECT 1').then(
    () => null,
    (error: Error) => error.message
  );
  const keyHandedOut = session.key.current !== null;
  const mirrorWhileLocked = { ready: reference.ready, tags: labels().length };

  /* A save made while locked waits rather than failing. */
  const whileLocked = journal.tags.addTag(group, 'written while locked');
  const whileLockedWaited = !(await settledWithin(whileLocked, 50));

  const reopenStarted = performance.now();
  await session.unlock(PROBE_DATA_KEY);
  const reopenMs = performance.now() - reopenStarted;
  await whileLocked;

  /* A save that took its journal handle before the lock and only reaches
     the database after the unlock, the way a save encrypting a photo does
     when the lock stops waiting for it: it has to land on the reopened
     database, not fail on the terminated worker. */
  const capturedLate = await opened.tags.addTag(group, 'captured before the lock').then(
    () => null,
    (error: Error) => error.message
  );

  const stored = (await journal.tags.getTagGroups()).flatMap((g) => g.tags.map((tag) => tag.label));

  /* L02-09: the mirror's refresh after a write has to read the journal open
     now, not the one the first hydrate was handed. */
  await journal.tags.addTag(group, 'after the reopen');
  let mirrorFollowed: string | null = null;
  try {
    await until(() => labels().includes('after the reopen'), 'the mirror to show a tag added after the reopen');
  } catch (error) {
    mirrorFollowed = (error as Error).message;
  }

  /* More rounds for the timing, which is what the sign-off reports. */
  const rounds: { lockMs: number; reopenMs: number }[] = [{ lockMs, reopenMs }];
  for (let round = 0; round < 4; round++) {
    await journal.tags.addTag(group, `round ${round}`);
    const a = performance.now();
    await session.lock();
    const b = performance.now();
    await session.unlock(PROBE_DATA_KEY);
    rounds.push({ lockMs: b - a, reopenMs: performance.now() - b });
  }
  const finalLabels = (await journal.tags.getTagGroups()).flatMap((g) => g.tags.map((tag) => tag.label));

  publish({
    heldOverLanded,
    oldDriverRefuses,
    keyHandedOut,
    mirrorWhileLocked,
    whileLockedWaited,
    capturedLate,
    stored,
    mirrorFollowed,
    mirrorAfterReopen: labels(),
    rounds,
    roundsLanded: [0, 1, 2, 3].every((round) => finalLabels.includes(`round ${round}`))
  });
}

run().catch((error) => publish({ error: String((error as Error)?.stack ?? error) }));
