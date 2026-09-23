/* The two Android background schedulers - scheduled auto-export and the
   wrapped / on-this-day notifications - and the one shape they share: a
   foreground check that runs on start, every fifteen minutes after, and
   whenever the app comes back to the foreground. Each module used to carry
   its own copy of that start/stop and its own CHECK_EVERY_MS, and the layout
   carried the same sixteen lines of starting one twice (final audit A8).
   What each check decides stays in its own module; when a check runs, and
   how long both live, is here. */

export const CHECK_EVERY_MS = 15 * 60 * 1000;

export function periodicCheck(run: () => void): { start(): void; stop(): void } {
  let timer: ReturnType<typeof setInterval> | null = null;
  const onVisibility = () => {
    if (document.visibilityState === 'visible') run();
  };
  return {
    start() {
      if (timer) return;
      timer = setInterval(run, CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', onVisibility);
      run();
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      document.removeEventListener('visibilitychange', onVisibility);
    }
  };
}

/* Starts both and returns what stops both. Each module is imported
   dynamically and on its own, as the layout always did: neither is in the
   first-load chunk, and one failing to load does not keep the other from
   starting. A stop that lands before a module arrives means it never
   starts. */
export function startBackgroundSchedulers(): () => void {
  let stopped = false;
  const stops: (() => void)[] = [];
  const schedulers = [
    import('./archive/auto-export-scheduler').then((m) => ({
      start: m.startAutoExportScheduler,
      stop: m.stopAutoExportScheduler
    })),
    import('./retrospective-notifications-scheduler').then((m) => ({
      start: m.startRetrospectiveNotificationsScheduler,
      stop: m.stopRetrospectiveNotificationsScheduler
    }))
  ];
  for (const scheduler of schedulers) {
    void scheduler.then(({ start, stop }) => {
      if (stopped) return;
      start();
      stops.push(stop);
    });
  }
  return () => {
    stopped = true;
    for (const stop of stops) stop();
  };
}
