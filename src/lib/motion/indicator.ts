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

   Redesign ticket 26 changed what the shape does on the way. It used to
   deform symmetrically - both edges moving at once, out from the centre,
   growing by a tuned percentage of its own length. That reads as one object
   being pulled from both ends. What it does now is asymmetric: the edge
   nearer the destination leaves first and decelerates into place, and the
   edge left behind holds, then accelerates after it and closes the shape up
   again. The width in between is not a tuned percentage of anything - it is
   the actual gap between the two tabs, because the two edges really are on
   the two tabs while it runs.

   This module is the mechanic: the arithmetic, plus the two schedules the
   edges run on. The measuring and the state live in the components, because
   they need `$state` and a DOM, and neither survives the node test tier.
   What is here is the part worth holding still: when two measurements count
   as the same place, the four numbers CSS positions the shape with, which of
   an axis's two edges leads, and what each edge's clock is.

   Both travelling indicators in the app now use it. Segmented.svelte had its
   own copy of the older symmetric idea, shipped in ticket 30 with a fixed
   stretch; the note that used to sit here said that if a third one ever
   turned up, that would be the moment the two became one. What actually
   happened is that the two converged instead - Alicja asked for the
   switcher to move the way the navigation does (2026-09-08) - so the moment
   arrived from the other direction and the schedules below are shared rather
   than transcribed. A third one would now have nothing left to duplicate. */

export type Box = { x: number; y: number; w: number; h: number };

export type Axis = 'x' | 'y';

/** The element the pill is positioned inside, at its padding box - which is
    what `offsetLeft`/`offsetTop` are measured from and what `left`/`right`
    resolve against, so the two agree with no correction. */
export type Host = { w: number; h: number };

/** The four lengths the pill is pinned by. Not a position and a size: the
    two edges of the travelling axis move on schedules of their own, and a
    width would have to be the difference between them at every instant
    rather than a value with a schedule. */
export type Insets = { left: number; right: number; top: number; bottom: number };

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

/** Where a box's four edges sit inside its host. The far pair can come out
    negative, which is correct rather than a fault: the rail scrolls, so a
    row past its fold is genuinely below the padding box both insets are
    measured against, and clamping would move the pill instead of describing
    it. */
export function insets(box: Box, host: Host): Insets {
  return {
    left: box.x,
    right: host.w - (box.x + box.w),
    top: box.y,
    bottom: host.h - (box.y + box.h)
  };
}

/** Which way the pill is going along its own axis, or 0 if it is not going
    anywhere along it. The sign is what the destination icon's swing leans
    with, so it is a direction rather than a distance: DIRECTION.md's motion
    is the same whether a tab is next door or across the bar, and the
    difference in how far the shape opens is already carried by the gap it
    opens across. */
export function travel(from: Box, to: Box, axis: Axis): -1 | 0 | 1 {
  const moved = axis === 'x' ? to.x - from.x : to.y - from.y;
  if (Math.abs(moved) < SAME) return 0;
  return moved > 0 ? 1 : -1;
}

/** The edge that leaves first, named for both shapes at once: 'near' is the
    left or top inset, 'far' the right or bottom one. A pill travelling
    toward larger coordinates leads with its far edge and drags its near one;
    coming back it is the other way round.

    null when nothing travelled, which is a placement rather than a slide -
    the first tab a session lands on, or a re-measure after the nav changed
    size. The component puts both edges on the leading schedule there, so the
    shape moves without ever opening. */
export function leadingEdge(direction: -1 | 0 | 1): 'near' | 'far' | null {
  if (direction === 0) return null;
  return direction > 0 ? 'far' : 'near';
}

/** One edge's clock, written as the token names rather than their values so
    the reduced-motion clamp reaches every part of it. */
export type Schedule = { dur: string; ease: string; delay: string };

/** The edge nearer the destination. It sets off first and decelerates into
    place over tier 2's own duration, on a curve that is --ease-out with the
    instant taken off the front: --ease-out leaves at four times its average
    speed, which is right for something appearing and wrong for a long edge
    setting off. */
export const LEAD: Schedule = { dur: 'var(--dur-med)', ease: 'var(--ease-out-soft)', delay: '0ms' };

/** The edge left behind. It waits --stagger-step - the token every staggered
    set in the app waits on, and one the clamp zeroes - then gathers and
    catches up over the longer --dur-slow, so the shape closes after the tab
    has already lit rather than at the same moment. */
export const TRAIL: Schedule = {
  dur: 'var(--dur-slow)',
  ease: 'var(--ease-in-out)',
  delay: 'var(--stagger-step)'
};

/** Which clock each of an axis's two insets runs on, for a move in this
    direction. A placement that is not a slide gets both on LEAD, so the
    shape moves as one piece and never opens. */
export function schedules(direction: -1 | 0 | 1): { near: Schedule; far: Schedule } {
  const lead = leadingEdge(direction);
  return {
    near: lead === 'far' ? TRAIL : LEAD,
    far: lead === 'near' ? TRAIL : LEAD
  };
}
