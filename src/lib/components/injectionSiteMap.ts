/* Where the rotation map's twelve dots sit (phase 4 ticket 02, re-spaced in
   phase 6 ticket 13).

   Beside InjectionSiteMap.svelte rather than inside it because the spacing
   is the only claim the map makes that can be got wrong silently: twelve
   touch targets on a 280px figure either stay separate or quietly overlap,
   and a component's <style> block is not somewhere a test can ask. */

import type { InjectionSite, InjectionSiteRegion } from '../data/doseSchedule';

/** The figure's box in CSS px: `max-width` on `.site-map` and the height
    its aspect ratio gives that width, matching the SVG's viewBox.

    The height is the binding constraint, not the width. The sheet this map
    lives in scrolls its own content in a 500px window on an 844px phone, so
    a figure taller than that can never be seen whole - at 560px the deltoid
    dots and the thigh dots were never on screen at once, which is a
    rotation map that cannot answer the question it exists for. 420px leaves
    the figure and its caption inside that window. */
/* MAP_WIDTH, MAP_HEIGHT stay exported only for their own test (AU-09 test-only
   review). */
export const MAP_WIDTH = 280;
export const MAP_HEIGHT = 420;

/** `--touch-target` in base.css, which this layout is spaced against and
    cannot read. The test next door holds the two in step. */
/* MAP_TOUCH_TARGET stays exported only for its own test (AU-09 test-only
   review). */
export const MAP_TOUCH_TARGET = 48;

/** The clear space Android asks for between two touch targets, on top of
    the targets themselves. Twelve dots on one small figure is exactly the
    layout where that guidance earns its keep. */
/* MAP_TOUCH_GAP stays exported only for its own test (AU-09 test-only review). */
export const MAP_TOUCH_GAP = 8;

/** Where each region sits on the silhouette, as percentages of the box.
    The left/right pair mirrors around the midline, so one entry per region
    places both.

    Read against the SVG in the component, whose viewBox is half again as
    tall as it is wide: the torso runs from 13% to 47% of the height, the
    pelvis to 59%, and the thighs from there to the foot of the box.

    Spaced so that no two of the twelve targets come within 8px of each
    other - see the test - and so that every dot sits inside the shape it
    names rather than over the gap beside it, which is what the flank and
    buttock insets are for: a hollow dot straddling the edge of the arm
    reads as a mistake. The widest pair sets the insets, because a
    region's two sides sit `100 - 2 * inset` apart: at 280px, an inset of
    40% is as far out as the abdomen can go and still leave its own two dots
    a target and a gap apart. The height then has to carry five vertical
    steps of at least as much again, which is what 420px is spent on and why
    the figure stops at the thigh: every site is above the knee, and drawing
    shins bought nothing but the scroll that hid half the map. */
const PLACEMENT: Record<InjectionSiteRegion, { top: number; inset: number }> = {
  deltoid: { top: 17, inset: 25 },
  abdomen: { top: 27, inset: 40 },
  loveHandle: { top: 41, inset: 39 },
  ventrogluteal: { top: 55, inset: 38 },
  dorsogluteal: { top: 69, inset: 36 },
  thigh: { top: 83, inset: 40 }
};

/** A site's dot as percentages of the box, for the component's inline
    `top`/`left`. */
export function sitePosition(site: InjectionSite): { top: number; left: number } {
  const place = PLACEMENT[site.region];
  return { top: place.top, left: site.side === 'left' ? place.inset : 100 - place.inset };
}

/** The same point in CSS px at the size the map actually renders at, which
    is the only unit a touch target can be compared against. */
/* siteCentre stays exported only for its own test (AU-09 test-only review). */
export function siteCentre(site: InjectionSite): { x: number; y: number } {
  const { top, left } = sitePosition(site);
  return { x: (left / 100) * MAP_WIDTH, y: (top / 100) * MAP_HEIGHT };
}
