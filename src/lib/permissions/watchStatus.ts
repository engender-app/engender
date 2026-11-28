/* Refresh permission status on return from system settings.
   Use the caller's unreadable fallback on failure instead of a stale
   grant. Reminders and Notifications report failed reads; the
   permissions list shows denied rows as `readGrantStates` does.

   Only the newest read applies. `stop()` removes the listener and
   invalidates pending reads. */

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
