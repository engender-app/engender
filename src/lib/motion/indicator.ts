/* Move one highlight between tabs or segments. The leading edge
   starts first and decelerates at the destination. The trailing
   edge holds, then accelerates to close the shape. Its widest span
   is the actual gap between targets.

   Components own DOM measurements and reactive state. This module
   converts positions to CSS and shares edge order and timing between
   navigation and Segmented.svelte. */

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
    as a new one would replay the stretch on every observer tick. Only the
    flag sun and mood faces use ambient loops. */
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

/** Direction of the pill along its axis, or zero when still. The icon
    leans that way regardless of how many tabs the pill passes. The pill
    stretches across the actual gap. */
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

/** The first placement, which is not a move at all. An unplaced pill is
    pinned at `left: 0; right: 0` - the whole track - and hidden by opacity,
    and the placement that shows it sets its insets in the same update. On
    LEAD those insets transitioned, so the pill faded in across the whole
    track and then shrank onto its segment: on a cold load at 4x CPU it sat
    full-width for about 280ms and then closed in two frames.
    Here the edges land where they belong in the frame the fade starts, and
    only the fade is seen. */
export const PLACE: Schedule = { dur: '0ms', ease: 'linear', delay: '0ms' };

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

/** The clocks for a pill crossing a grid rather than a row: each axis is a row of its own,
    so each pair of insets takes `schedules` for the way the pill went along that axis. A
    move straight down keeps left and right together, and a diagonal leads with the two
    edges facing the destination. */
export function gridSchedules(
  from: Box,
  to: Box
): { left: Schedule; right: Schedule; top: Schedule; bottom: Schedule } {
  const x = schedules(travel(from, to, 'x'));
  const y = schedules(travel(from, to, 'y'));
  return { left: x.near, right: x.far, top: y.near, bottom: y.far };
}
