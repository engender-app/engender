import { preloadCode } from '$app/navigation';
import { page } from '$app/state';

const DOORS = ['/', '/calendar', '/stats', '/more'];
const attempted = new Set<string>();
let inFlight: Promise<void> | null = null;

export const loadRetainedDoors = () => import('./RetainedDoors.svelte');

/** Prepare route code after opening, without mounting screens or reading data.
    Imports already started cannot be cancelled; stopping prevents the next one. */
export function preloadDoors(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  let finish!: () => void;
  const completed = new Promise<void>((resolve) => { finish = resolve; });
  let stopped = false;
  const pointers = new Set<number>();
  const keys = new Set<string>();
  let generation = 0;

  function schedule() {
    if (stopped) return;
    const mine = ++generation;
    // WebView can leave an idle callback queued until the next navigation.
    requestIdleCallback(async (deadline) => {
      if (stopped || mine !== generation || pointers.size || keys.size || document.visibilityState !== 'visible' ||
          document.documentElement.dataset.splash !== undefined) return;
      if (!deadline.didTimeout && deadline.timeRemaining() <= 0) return schedule();
      if (inFlight) {
        await inFlight;
        if (mine === generation) schedule();
        return;
      }
      attempted.add(page.url.pathname);
      const next = DOORS.find((path) => !attempted.has(path));
      if (!next) return stop();
      attempted.add(next);
      // A failed optional preload must not block normal navigation or the other doors.
      const loading = preloadCode(next).catch(() => {});
      inFlight = loading;
      await loading;
      if (inFlight === loading) inFlight = null;
      if (mine === generation) schedule();
    }, { timeout: 1000 });
  }

  const hold = (event: Event) => {
    if (event.type === 'keydown') keys.add((event as KeyboardEvent).code);
    else pointers.add((event as PointerEvent).pointerId);
    generation += 1;
  };
  const release = (event: Event) => {
    if (event.type === 'keyup') keys.delete((event as KeyboardEvent).code);
    else pointers.delete((event as PointerEvent).pointerId);
    schedule();
  };
  const visibility = () => {
    pointers.clear();
    keys.clear();
    generation += 1;
    if (document.visibilityState === 'visible') schedule();
  };
  const listeners = {
    pointerdown: hold, pointerup: release, pointercancel: release,
    keydown: hold, keyup: release, wheel: schedule, scroll: schedule,
    visibilitychange: visibility
  };
  for (const [event, listener] of Object.entries(listeners)) document.addEventListener(event, listener, true);
  const splash = new MutationObserver(schedule);
  splash.observe(document.documentElement, { attributes: true, attributeFilter: ['data-splash'] });

  function stop() {
    stopped = true;
    generation += 1;
    splash.disconnect();
    for (const [event, listener] of Object.entries(listeners)) document.removeEventListener(event, listener, true);
    signal.removeEventListener('abort', stop);
    finish();
  }
  signal.addEventListener('abort', stop, { once: true });
  schedule();
  return completed;
}
