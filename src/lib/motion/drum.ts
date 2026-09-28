/* Tier 3, change within a screen: a glyph passing through a block (phase 10
   redesign ticket 19).

   The log strip's squares are blocks of the flag's stripe with a glyph in
   the block's ink, and two of them change what they show without leaving
   the screen: a tally answers a tap with the day's count, and the wear
   shape turns from "start" to "stop" when a session begins. DIRECTION.md
   rule 10 says a block's contents move like objects and never fade from
   nothing, so the glyph is a drum face: the old one rises out through the
   block's top edge and the new one rises in from under its bottom edge,
   both clipped by the block itself (`overflow: hidden` on the square). A
   transform alone - the block does the covering, which is the performance
   contract's cheapest possible material (materials.css).

   Two halves rather than one bidirectional transition because they are two
   elements: `{#key}` mounts the new face while the old one is still
   leaving, and each needs its own travel. Both run on --dur-med, the
   routine state-change duration, on --ease-out.

   A stepper's numeral goes both ways (ticket 281, the month picker's
   year), so `dir` says which: 1, the default, is the value going up and
   the faces rising; -1 is the value going down and the faces falling, the
   new one dropping in from above. Under reduced motion the faces do not
   travel and fade instead, which is tier 3's substitute: the block still
   says what changed, and says it as a change rather than a cut. */
import type { TransitionConfig } from 'svelte/transition';
import { crossfadeDuration, EASE_OUT, fadeOnly, isReducedMotion, motionDuration } from './tokens';

type Turn = { dir?: 1 | -1 };

/** The new face, rising in from under the block's bottom edge (or dropping
    in over its top edge, turning the other way). */
export function drumIn(_node: Element, { dir = 1 }: Turn = {}): TransitionConfig {
  if (isReducedMotion()) return fadeOnly(crossfadeDuration());
  return {
    duration: motionDuration('--dur-med'),
    easing: EASE_OUT,
    css: (t, u) => `translate: 0 ${round(dir * u * 100)}%`
  };
}

/** The old face, rising out through the block's top edge (or falling out
    through its bottom one). */
export function drumOut(_node: Element, { dir = 1 }: Turn = {}): TransitionConfig {
  if (isReducedMotion()) return fadeOnly(crossfadeDuration());
  return {
    duration: motionDuration('--dur-med'),
    easing: EASE_OUT,
    css: (t, u) => `translate: 0 ${round(-dir * u * 100)}%`
  };
}

/* Two decimals, as the wipe writes its inset: whole percents stepped a
   48px travel in visible half-pixel jumps, and a round frame still writes
   as a round value. */
const round = (n: number) => Number(n.toFixed(2));
