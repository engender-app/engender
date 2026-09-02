/* Where the rotation map's twelve dots sit (phase 4 ticket 02, re-spaced in
   phase 6 ticket 13).

   Beside InjectionSiteMap.svelte rather than inside it because the spacing
   is the only claim the map makes that can be got wrong silently: twelve
   touch targets on a 280px figure either stay separate or quietly overlap,
   and a component's <style> block is not somewhere a test can ask. */

import type { InjectionSite, InjectionSiteRegion } from '../data/doseSchedule';

/** The figure's width in CSS px, which is `max-width` on `.site-map` and
    what the map renders at on a 320px phone. The box is twice as tall as
    it is wide, matching the SVG's viewBox. */
export const MAP_WIDTH = 280;

/** `--touch-target` in base.css, which this layout is spaced against and
    cannot read. The test next door holds the two in step. */
export const MAP_TOUCH_TARGET = 48;

/** The clear space Android asks for between two touch targets, on top of
    the targets themselves. Twelve dots on one small figure is exactly the
    layout where that guidance earns its keep. */
export const MAP_TOUCH_GAP = 8;

/** Where each region sits on the silhouette, as percentages of the box.
    The left/right pair mirrors around the midline, so one entry per region
    places both.

    Read against the SVG in the component, whose viewBox is twice as tall as
    it is wide: the torso runs from 15% to 44% of the height, the pelvis to
    49%, and the legs from there down.

    Spaced so that no two of the twelve targets come within 8px of each
    other - see the test. The binding constraint is the widest pair, because
    a region's two sides sit `100 - 2 * inset` apart: at 280px, an inset of
    40% is as far out as the abdomen can go and still leave its own two dots
    a target and a gap apart. The stack then has 274px of height for six
    rows, which is why the vertical steps are as even as they are. */
const PLACEMENT: Record<InjectionSiteRegion, { top: number; inset: number }> = {
  deltoid: { top: 18, inset: 25 },
  abdomen: { top: 28, inset: 40 },
  loveHandle: { top: 37.5, inset: 33 },
  ventrogluteal: { top: 47.5, inset: 36 },
  dorsogluteal: { top: 57.5, inset: 33 },
  thigh: { top: 67, inset: 40 }
};

/** A site's dot as percentages of the box, for the component's inline
    `top`/`left`. */
export function sitePosition(site: InjectionSite): { top: number; left: number } {
  const place = PLACEMENT[site.region];
  return { top: place.top, left: site.side === 'left' ? place.inset : 100 - place.inset };
}

/** The same point in CSS px at the width the map actually renders at, which
    is the only unit a touch target's size can be compared against. */
export function siteCentre(site: InjectionSite): { x: number; y: number } {
  const { top, left } = sitePosition(site);
  return { x: (left / 100) * MAP_WIDTH, y: (top / 100) * MAP_WIDTH * 2 };
}
