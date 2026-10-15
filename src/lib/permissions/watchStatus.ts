/* Keeps a permission status current while a screen is open (last-audit UI
   ticket 41).

   The way out of a refusal is a system screen, so the answer changes while
   the app is not looking: somebody grants notifications or exact alarms in
   Android's settings and swipes back. The permissions list already re-read
   on the way back; the Reminders and Notifications screens read once at
   mount and kept a "denied" notice up after the grant. One owner now, for
   all three.

   Three rules a screen should not have to remember:

   - A read that fails shows `unreadable`, never an older answer: a
     remembered "granted" is exactly what a failed read can no longer vouch
     for. Reminders and Notifications pass a value of its own and say they
     could not check; the permissions list passes its denied rows, which
     readGrantStates already settles a failed read to.
   - The newest read wins. A read started before the trip to settings can
     answer after the one started on the return, and must not put the stale
     answer back.
   - `stop()` takes the listener off and drops any answer still in flight,
     so a screen that has gone cannot be written to. */

export type VisiblePage = Pick<Document, 'visibilityState'> & {
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
};

export function watchStatus<T>(options: {
  read: () => Promise<T>;
  /** What a failed read shows. */
  unreadable: T;
  apply: (status: T) => void;
  /** The document, unless a test hands in its own. */
  page?: VisiblePage;
}): { refresh(): Promise<void>; stop(): void } {
  const { read, unreadable, apply, page = document } = options;
  let latest = 0;
  let stopped = false;

  async function refresh() {
    if (stopped) return;
    const ticket = ++latest;
    let status: T;
    try {
      status = await read();
    } catch (error) {
      console.error('Could not read a permission status', error);
      status = unreadable;
    }
    if (!stopped && ticket === latest) apply(status);
  }

  const onVisible = () => {
    if (page.visibilityState === 'visible') void refresh();
  };
  page.addEventListener('visibilitychange', onVisible);
  void refresh();

  return {
    refresh,
    stop() {
      stopped = true;
      page.removeEventListener('visibilitychange', onVisible);
    }
  };
}
