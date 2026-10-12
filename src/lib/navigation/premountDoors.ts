/* Mounts the doors nobody has visited yet, hidden, while the app sits
   still (ticket 09, a measured arm behind arrivalExperiment.ts).

   A first visit to a door used to mount the whole screen in the middle of
   its arrival: about 73 ms for the Journal and 100 ms for Home's return on
   the Pixel 10a, where a revisit of a retained door costs 42-67 ms. Mounted
   beforehand, display:none and inert like any hidden retained door, the
   first visit is a revisit. Nothing is painted until then.

   One door per idle period, and never while a finger or key is down, the
   page scrolls, a screen is moving, the splash holds or the page is
   hidden: a mount is one long task, and it must not land under input. The
   idle callback carries a timeout because this WebView can leave plain
   idle callbacks queued until the next navigation (preloadDoors.ts). */
import { screenStill } from '$lib/stores/ui.svelte';

/** Before another door, so the last one's reads have answered. */
const BETWEEN_MS = 500;
/** How long to look away after input before trying again. */
const AFTER_INPUT_MS = 250;

export function premountDoors(signal: AbortSignal, next: () => string | null, mount: (door: string) => void): void {
  if (signal.aborted) return;
  let stopped = false;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pointers = new Set<number>();
  const keys = new Set<string>();
  const root = document.documentElement;

  const later = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(schedule, ms);
  };
  const busy = () =>
    pointers.size > 0 || keys.size > 0 || document.visibilityState !== 'visible' || !screenStill() ||
    root.dataset.nav !== undefined || root.dataset.splash !== undefined;

  function schedule() {
    if (stopped) return;
    const mine = ++generation;
    requestIdleCallback((deadline) => {
      if (stopped || mine !== generation) return;
      if (busy()) return later(AFTER_INPUT_MS);
      if (!deadline.didTimeout && deadline.timeRemaining() <= 0) return schedule();
      const door = next();
      if (door === null) return stop();
      mount(door);
      later(BETWEEN_MS);
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
    later(AFTER_INPUT_MS);
  };
  const away = () => {
    generation += 1;
    later(AFTER_INPUT_MS);
  };
  const visibility = () => {
    pointers.clear();
    keys.clear();
    away();
  };
  const listeners = {
    pointerdown: hold, pointerup: release, pointercancel: release,
    keydown: hold, keyup: release, wheel: away, scroll: away,
    visibilitychange: visibility
  };
  for (const [event, listener] of Object.entries(listeners)) document.addEventListener(event, listener, true);

  function stop() {
    stopped = true;
    generation += 1;
    clearTimeout(timer);
    for (const [event, listener] of Object.entries(listeners)) document.removeEventListener(event, listener, true);
  }
  signal.addEventListener('abort', stop, { once: true });
  later(BETWEEN_MS);
}
