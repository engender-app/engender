/* Block service worker activation and hide the update action during journal
   writes and migrations. writes.ts wraps all journal writes, including
   Archive imports; boot.ts covers migrations. Count overlapping operations so
   the first completion cannot clear the guard. Keep the counter rune-free for
   Node tests and service worker messaging.

   Preference writes are a single atomic pref upsert outside this guard.
   The counter is page-local; the encrypted driver holds one writing
   connection per origin (ADR-0020). */

let open = 0;
let failedWrites = 0;
const listeners = new Set<(busy: boolean) => void>();

function announce(busy: boolean): void {
  for (const listener of listeners) listener(busy);
}

/** Opens the guard, and hands back the release. Call it in a `finally`: a
    write that threw has finished as surely as one that resolved, and a
    release that never runs would keep the app on an old release for the rest
    of the session.

    Pass false when the operation failed so an update leaves recovery on
    screen. The release is idempotent, so a caller that has already let go cannot
    release somebody else's write by calling twice. */
export function markJournalBusy(): (succeeded?: boolean) => void {
  open += 1;
  if (open === 1) announce(true);

  let released = false;
  return (succeeded = true) => {
    if (released) return;
    released = true;
    if (!succeeded) failedWrites += 1;
    open -= 1;
    if (open === 0) announce(false);
  };
}

/** True while anything an update must not interrupt is running. */
export function journalIsBusy(): boolean {
  return open > 0;
}

/** Called on the edges only - when the journal becomes busy and when it goes
    idle again - because that is the whole of what a listener acts on.
    Returns the way to stop listening. */
export function onJournalBusyChange(listener: (busy: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** For housekeeping that must not run alongside a write. Both boot passes read rows and then act on what they read, and since
    they moved off boot's critical path they run with the screens live - so a
    write that lands between the read and the act would make the purge delete
    an entry somebody restored, or the sweep delete the files of a photo
    somebody just attached.

    `sawWrite()` answers whether any write has been in flight since the watch
    started, itself included: a pass asks before every step it cannot take
    back, and gives up when the answer is yes. Giving up is safe by
    construction - what a pass does not finish is what the next due pass retries,
    which is what both of their failure paths already do.

    Not a lock. Nothing here can stop a write from starting; a screen saving an
    entry has priority over housekeeping by any reading. */
export function watchJournalWrites(): { sawWrite: () => boolean; stop: () => void } {
  let saw = journalIsBusy();
  const stop = onJournalBusyChange((busy) => {
    if (busy) saw = true;
  });
  return { sawWrite: () => saw, stop };
}

/** Check after write callers have handled their results. Another write
    admitted in that gap keeps the listener until the next edge. */
function checkAfterJournalWrites(check: () => boolean): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    timer = undefined;
    if (check()) {
      stop();
      clearTimeout(timer);
    }
  };
  const schedule = () => {
    if (timer === undefined) timer = setTimeout(run, 0);
  };
  const stop = onJournalBusyChange(schedule);
  schedule();
}

/** Wait for admitted writes before starting a fresh housekeeping read.
    The pass still watches for writes starting after it begins. */
export function waitForJournalIdle(): Promise<void> {
  return new Promise((resolve) => {
    checkAfterJournalWrites(() => {
      if (journalIsBusy()) return false;
      resolve();
      return true;
    });
  });
}

/** Captures the write outcome before an asynchronous handover starts.
    Complete it only after activation settles. Reload runs in an idle task,
    after the write caller has handled its result; another write starting in
    that gap postpones it again. A failure cancels this attempt so the caller
    can show its existing recovery UI. No writes are refused or locked. */
export function prepareJournalHandover(): (handover: () => void) => Promise<boolean> {
  const failuresBefore = failedWrites;
  return (handover) => new Promise<boolean>((resolve) => {
    checkAfterJournalWrites(() => {
      if (failedWrites !== failuresBefore) {
        resolve(false);
        return true;
      } else if (!journalIsBusy()) {
        handover();
        resolve(true);
        return true;
      }
      return false;
    });
  });
}
