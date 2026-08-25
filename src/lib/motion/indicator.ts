/* The travelling indicator: one lit shape that crosses a set of peers
   instead of appearing on one and disappearing from another (phase 5
   ticket 31).

   The navigation had the second kind. Every tab carried its own background
   and the lit one was whichever had the class, so moving between tabs was
   two instant swaps that happened to be simultaneous - which says "this one
   is on now" and nothing at all about where you came from. A single shape
   that travels says both, and on a bar of five cells where two of the four
   tabs sit on the far side of the add button, where you came from is most of
   what a person needs to read.

   This module is the arithmetic only. The measuring and the state live in
   AppNav.svelte, because they need `$state` and a DOM, and neither survives
   the node test tier. What is here is the part worth holding still: when two
   measurements count as the same place, and how much the shape deforms on
   the way.

   Segmented.svelte has its own copy of this idea, shipped in ticket 30 with
   a fixed stretch. Left alone on purpose - it is a working control and this
   ticket is not its ticket - but if a third travelling indicator ever turns
   up, that is the moment the two should become one. */

export type Box = { x: number; y: number; w: number; h: number };

export type Axis = 'x' | 'y';

/** Under this, two measurements are the same place. Layout arithmetic on a
    fractional device pixel ratio lands a third of a pixel either side of
    where it landed last time, and a resize that reports the same position
    as a new one would replay the stretch on every observer tick - which
    would turn a moment into a loop, the one thing DIRECTION.md's motion
    system spends nowhere but the flag sun. */
const SAME = 0.5;

export function boxesMatch(a: Box, b: Box): boolean {
  return (
    Math.abs(a.x - b.x) < SAME &&
    Math.abs(a.y - b.y) < SAME &&
    Math.abs(a.w - b.w) < SAME &&
    Math.abs(a.h - b.h) < SAME
  );
}

/** How much the pill lengthens per its own length of travel, and the most
    it will ever lengthen. A tab-to-tab hop on the bar is roughly one pill
    length and comes out at about 8%; the jump from Calendar to Stats
    crosses the add button and three cells, and lands near the cap.

    Distance-proportional rather than fixed because the alternative is a
    diagram: a shape that deforms identically whether it moved 60px or 240px
    is illustrating the idea of travel rather than answering to any. */
const PER_LENGTH = 0.08;
const CAP = 0.18;

/** The peak scale along the axis the pill is travelling on. */
export function stretch(from: Box, to: Box, axis: Axis): number {
  const distance = axis === 'x' ? Math.abs(to.x - from.x) : Math.abs(to.y - from.y);
  const size = axis === 'x' ? to.w : to.h;
  if (!size || !distance) return 1;
  return 1 + Math.min(CAP, (distance / size) * PER_LENGTH);
}

/** How much it thins while it lengthens. Not the reciprocal, which conserves
    area exactly and reads as rubber; a little less than that, so the pill
    reads as something with weight being carried rather than stretched. */
export function squash(peak: number): number {
  return 1 - (peak - 1) * 0.6;
}
