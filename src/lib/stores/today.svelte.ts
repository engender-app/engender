/* The current local day as something a screen can react to.

   `todayEpochDay()` reads only `new Date()`, so a `$derived(todayEpochDay())`
   or a `const today = todayEpochDay()` is computed once and never again: a
   screen left open over midnight kept yesterday's greeting, tiles and
   unlock checks until it was reloaded (phase 15 after-release 02). Reading
   `currentDay()` inside a `$derived`, an `$effect` or a template does
   subscribe, and the subscription wakes at the next local midnight and
   whenever the page becomes visible again - a phone asleep over midnight
   fires its timer late or not at all, and the visibility change is what
   catches that.

   Reads outside any reactive context just return today. A write must read
   the day when it happens, so those keep calling `todayEpochDay()` inline
   rather than a captured value (tests/today-capture.test.ts). */

import { createSubscriber } from 'svelte/reactivity';
import { msUntilNextLocalMidnight, todayEpochDay } from '$lib/data/epochDay';

const subscribe = createSubscriber((update) => {
  let timer: ReturnType<typeof setTimeout>;
  const arm = () => {
    timer = setTimeout(() => {
      update();
      arm();
    }, msUntilNextLocalMidnight());
  };
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    clearTimeout(timer);
    update();
    arm();
  };
  arm();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
});

/** Today's epoch day, re-read when the local day changes. */
export function currentDay(): number {
  subscribe();
  return todayEpochDay();
}
