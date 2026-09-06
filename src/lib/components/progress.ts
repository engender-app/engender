/* The arithmetic behind Progress.svelte (phase 9 audit ticket 11, ADR-0070):
   how far along a run is, and how long its bar stays on screen at either
   end of it. Kept out of the component, and out of progress.svelte.ts with
   it, so the decisions that have a right answer are under the node tier
   rather than only under a mounted browser.

   Nothing here reads a clock or a token. The hold is passed in, because it
   is motionDuration('--dur-med') at the one place that has a document to
   read it from - and that already returns 0 under reduced motion, which is
   the whole of this module's reduced-motion behaviour. */

/** How long an operation has to run before its bar appears at all. Enough
    that a Daylio CSV import of a few hundred rows finishes without one
    (ADR-0070 has no duration benchmark for that path), short enough that
    anything a person would call slow still shows a bar promptly. */
export const PROGRESS_SHOW_DELAY_MS = 300;

/** Once a bar is up it stays up this long, on top of the completion hold.
    The show delay stops a fast operation flashing a bar; this stops one
    that crossed the delay by a hair from flashing it for two frames. */
export const PROGRESS_MIN_VISIBLE_MS = 300;

/** How often the fill is repainted, regardless of how often the operation
    underneath reports. Restore fires per row every 10-40ms on the long-
    journal fixture, and the fill tweens over --dur-slow (380ms): a
    transform written faster than that never lets a tween finish, which
    reads as nervous rather than alive. Just over --dur-slow, so each tween
    lands before the next sample starts one - progress.test.ts holds it
    there against the token's own fallback table. */
export const PROGRESS_SAMPLE_MS = 400;

/** How full the fill should be, or null when the operation cannot say -
    which is the indeterminate case, not a zero. */
export function progressFraction(done: number, total: number): number | null {
  if (!(total > 0)) return null;
  return Math.min(1, Math.max(0, done / total));
}

/** The number beside the bar. Whole percents, because it snaps to each
    sampled value while only the fill tweens (ADR-0070): a count-up label
    next to a smoothly moving bar narrates the same fact at two speeds. */
export function progressPercent(fraction: number | null): number | null {
  return fraction === null ? null : Math.round(fraction * 100);
}

/** How long to keep a visible bar up once its operation has finished:
    the completion hold, or the rest of the minimum-visible floor if that
    is still running. */
export function settleDelay(visibleForMs: number, holdMs: number): number {
  return Math.max(0, holdMs, PROGRESS_MIN_VISIBLE_MS - visibleForMs);
}
