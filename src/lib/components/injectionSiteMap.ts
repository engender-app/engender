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

/** Where each region sits on the silhouette, as percentages of the box.
    The left/right pair mirrors around the midline, so one entry per region
    places both.

    Read against the SVG in the component, whose viewBox is twice as tall as
    it is wide: the torso runs from 15% to 44% of the height, the pelvis to
    49%, and the legs from there down.

    Spaced so that no two of the twelve targets overlap - see the test. The
    binding constraint is the widest pair, because a region's two sides sit
    `100 - 2 * inset` apart: at 280px, an inset of 41% is as far out as the
    abdomen can go and still leave its own two dots a target apart. */
const PLACEMENT: Record<InjectionSiteRegion, { top: number; inset: number }> = {
  deltoid: { top: 19, inset: 25 },
  abdomen: { top: 30, inset: 41 },
  loveHandle: { top: 38, inset: 34 },
  ventrogluteal: { top: 47, inset: 37 },
  dorsogluteal: { top: 55.5, inset: 33 },
  thigh: { top: 64, inset: 40 }
};

/** A site's dot as percentages of the box, for the component's inline
    `top`/`left`. */
export function sitePosition(site: InjectionSite): { top: number; left: number } {
  const place = PLACEMENT[site.region];
  return { top: place.top, left: site.side === 'left' ? place.inset : 100 - place.inset };
}

/** The same point in CSS px at the width the map actually renders at, which
    is the only unit a touch target's size can be compared against. */
export function siteCentre(site: InjectionSite, mapWidth = MAP_WIDTH): { x: number; y: number } {
  const { top, left } = sitePosition(site);
  return { x: (left / 100) * mapWidth, y: (top / 100) * mapWidth * 2 };
}
