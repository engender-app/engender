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
   routine state-change duration, on --ease-out. Under reduced motion
   `motionDuration` answers 0 and the face cuts, which is tier 3's
   substitute - the block still says what changed. */
import type { TransitionConfig } from 'svelte/transition';
import { EASE_OUT, motionDuration } from './tokens';

/** The new face, rising in from under the block's bottom edge. */
export function drumIn(_node: Element): TransitionConfig {
  return {
    duration: motionDuration('--dur-med'),
    easing: EASE_OUT,
    css: (t, u) => `translate: 0 ${round(u * 100)}%`
  };
}

/** The old face, rising out through the block's top edge. */
export function drumOut(_node: Element): TransitionConfig {
  return {
    duration: motionDuration('--dur-med'),
    easing: EASE_OUT,
    css: (t, u) => `translate: 0 ${round(-u * 100)}%`
  };
}

/* Two decimals, as the wipe writes its inset: whole percents stepped a
   48px travel in visible half-pixel jumps, and a round frame still writes
   as a round value. */
const round = (n: number) => Number(n.toFixed(2));
