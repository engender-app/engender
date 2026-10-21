/* Shared foreground check for scheduled auto-export. */

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

/* Import scheduler after startup. A stop before import prevents start. */
export function startBackgroundSchedulers(): () => void {
  let stopped = false;
  const stops: (() => void)[] = [];
  const schedulers = [
    import('./archive/auto-export-scheduler').then((m) => ({
      start: m.startAutoExportScheduler,
      stop: m.stopAutoExportScheduler
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
