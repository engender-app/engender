/* Screen arrival markers and window tracking.
   Extracted from reveal.ts so layout and gates can stamp screen arrival
   without dragging in the full reveal transition machinery. */

import { motionDuration } from './tokens';

let tabRevealBy: number | undefined;

/** Ready panels share the field's arrival instead of starting another one. */
export function beginTabArrival(): void {
  tabRevealBy = performance.now() + motionDuration('--dur-slow');
}

export function endTabArrival(): void {
  tabRevealBy = undefined;
}

/* A read answering during the field's travel shares what is left of it,
   but never below --dur-fast. Look back's rail used to be squeezed into
   whatever remained: answering about 40ms before the stop, it went from
   skeleton to almost fully drawn in one frame, which Alicja rejected as a
   yank. An answer with less than that left keeps
   its placeholder until the field stops and then reveals at full length
   (arrivalHold.svelte.ts); one with more is fitted into the travel, no
   shorter than --dur-fast. */
function revealFloor(): number {
  return motionDuration('--dur-fast');
}

/** Whether so little of the tab arrival under way is left that a reveal
    starting now would have to be squeezed below --dur-fast to end with
    it. False outside a tab arrival. */
export function arrivalTooShortToReveal(): boolean {
  return tabRevealBy !== undefined && tabRevealBy - performance.now() < revealFloor();
}

export function readRevealDuration(token: '--dur-fast' | '--dur-med'): number {
  const duration = motionDuration(token);
  return tabRevealBy === undefined
    ? duration
    : Math.min(duration, Math.max(revealFloor(), tabRevealBy - performance.now()));
}

/** Fit nested entrances, including their stagger, into the field's remaining movement. */
export function fitReadArrival(animations: Animation[]): void {
  if (tabRevealBy === undefined) return;
  fitBefore(animations, tabRevealBy);
}

function fitBefore(animations: Animation[], deadline: number): void {
  const remaining = Math.max(revealFloor(), deadline - performance.now());
  for (const animation of animations) {
    const timing = animation.effect?.getComputedTiming();
    if (!timing || timing.iterations === Infinity || animation.playState === 'finished') continue;
    const left = Number(timing.endTime) - Number(animation.currentTime ?? 0);
    /* The floor is on what the eye sees: a staggered entrance's own
       movement, not its delay plus movement, plays no shorter than
       --dur-fast. Such an entrance may end a frame or so after the
       deadline, which sits two frames before the field stops. */
    const ceiling = Math.max(1, Number(timing.duration) / revealFloor());
    animation.playbackRate = Math.max(animation.playbackRate, Math.min(left / remaining, ceiling));
  }
}

/** Keep new layers at their first position while Android prepares their paint.
    Read fades can share the field's deadline; the field keeps its authored speed. */
export function playAfterPaint(
  owner: HTMLElement,
  animations: Animation[],
  { fitArrival = false }: { fitArrival?: boolean } = {}
): void {
  const deadline = fitArrival ? tabRevealBy : undefined;
  for (const animation of animations) {
    animation.pause();
    animation.currentTime = 0;
  }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    // Paint preparation spends part of the field's remaining arrival.
    if (deadline !== undefined && owner.isConnected) fitBefore(animations, deadline);
    for (const animation of animations) {
      if (owner.isConnected) {
        if (animation.playState !== 'finished' && animation.playState !== 'idle') animation.play();
      }
      else animation.cancel();
    }
  }));
}

/* When the screen under the panels last changed, as a `performance.now()`
   reading. Set at module load, because that is the app opening, and then by
   the shell on every navigation and every boot state change (+layout.svelte)
   - the two ways one screen becomes another. */
let arrivedAt = typeof performance === 'undefined' ? 0 : performance.now();

/** Called by the shell when a screen arrives. See `collapse`. */
export function markScreenArrival(now: number = performance.now()): void {
  arrivedAt = now;
}

/**
 * Closes the window early, for an arrival that outlasts it.
 *
 * The app opening is the one (redesign ticket 34): it runs for --dur-slow
 * and the boot marks an arrival part-way through it, when the journal
 * finishes opening, so the window was still standing after the screen had
 * stopped moving.
 *
 * The rule the window states is unchanged: while the screen is still
 * arriving a panel appearing is part of that, and once it has stopped a
 * panel appearing is a change. This is only how a long arrival says it has
 * stopped.
 */
export function endScreenArrival(): void {
  arrivedAt = -Infinity;
}

/* A screen's panels are gated on reads that answer a few dozen milliseconds
   after it mounts, so their `{#if}`s all flip shortly *after* arrival rather
   than during it. The window is the screen's own arrival duration: while the
   screen is still moving, a panel appearing is part of it arriving; once it
   has stopped, a panel appearing is a change. Measured on the demo journal,
   Home's slowest panel lands 111-119ms after the tab is tapped, so --dur-med
   covers it with room over. */
export function stillArriving(): boolean {
  return performance.now() - arrivedAt < motionDuration('--dur-med');
}
