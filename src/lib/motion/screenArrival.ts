/* Screen arrival markers and window tracking.
   Extracted from reveal.ts so layout and gates can stamp screen arrival
   without dragging in the full reveal transition machinery. */

import { motionDuration } from './tokens';

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
