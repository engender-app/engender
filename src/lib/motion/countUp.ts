/* Tier 3, change within a screen: a count on a block counting up to its
   value (phase 10 redesign ticket 25, DIRECTION.md rule 10).

   A live tile's value is a string the screen already formatted - "28",
   "Estradiol valerate", "9h 0m 15s", "3 Aug 2025" - and only one of those
   is a quantity. A count is something the eye can watch arrive, digit by
   digit, and a block whose number rises as the block itself clips open reads
   as a reading being taken rather than as a label being pasted. A name has
   no travel between two values; a duration is already moving on its own
   clock; a date is a name for a day. Those cut, which is what they did
   before this and is still the right answer for them.

   Held to `--dur-slow`, the tier's own duration, on the tier's own curve,
   so the number lands on the frame the block's clip does (kit.css,
   `kit-block-in`). Under reduced motion the substitute is the final number
   at once - nothing moves, and the reading is not withheld for 380ms from
   somebody who asked for stillness.

   The shape is reveal.ts's: a runner that reads the token layer and hands
   back a cancel, so the component that owns the number keeps owning it and
   this module never touches a node. */

import { EASE_OUT, motionDuration } from './tokens';

/** The whole number a tile's value is, or null where the value is anything
    else. Digits only, deliberately: a thousands separator differs by
    locale, and a value written with one is a formatted string rather than
    a count this can rebuild without knowing the locale it was formatted in.
    Every count a tile shows today is `String(n)`, so digits are the whole
    case; the day one is formatted with a separator it cuts, which is what
    every value does that this does not recognise. */
export function asCount(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null;
  return Number(value);
}

/** The number shown at `t` of the travel from `from` to `to`, on the
    tier's curve, rounded so a count never shows a fraction. */
export function countAt(from: number, to: number, t: number): number {
  return Math.round(from + (to - from) * EASE_OUT(Math.min(1, Math.max(0, t))));
}

/**
 * Counts from `from` to `to` over `--dur-slow`, calling `show` with the
 * number to draw on every frame, and hands back a cancel for the caller
 * whose value changes again mid-travel or whose node is going away.
 *
 * Reduced motion, and a travel with no distance, both call `show(to)` once
 * and schedule nothing.
 */
export function countUp(from: number, to: number, show: (n: number) => void): () => void {
  /* motionDuration is 0 under reduced motion already, so the one check
     covers both the clamp and a token authored at nothing. */
  const duration = motionDuration('--dur-slow');
  if (duration === 0 || from === to) {
    show(to);
    return () => {};
  }
  let frame = 0;
  const began = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - began) / duration);
    show(countAt(from, to, t));
    if (t < 1) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
}
