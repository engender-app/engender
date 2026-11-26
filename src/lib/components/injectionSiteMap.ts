/* Where the rotation map's twelve dots sit (phase 4 ticket 02, re-spaced in
   phase 6 ticket 13, re-placed against the shared silhouette in phase 11
   ticket 48).

   Beside InjectionSiteMap.svelte rather than inside it because the spacing
   is the only claim the map makes that can be got wrong silently: twelve
   touch targets on one small figure either stay separate or quietly overlap,
   and a component's <style> block is not somewhere a test can ask. */

import type { InjectionSite, InjectionSiteRegion } from '../data/doseSchedule';
import { FIGURE_BOX, type Pt } from './bodySilhouette';

/** Frame the first 135 units of the 100 x 176 body (ADR-0087).
    All twelve sites are above the knee. Targets need 48px with 8px gaps,
    which requires a figure width of at least 312px. The full body
    would be 549px tall at that width. Cropping to 135 units at 320px
    gives 432px and leaves room for the caption in a 505px sheet. */
export const MAP_VIEW = { width: FIGURE_BOX.width, height: 135 } as const;

/** The figure's box in CSS px, and the px each figure unit is drawn at.

    320px is as wide as the map goes. The sheet gives its content 350px on
    a 390px phone; on a 320px phone it has only 280px, so the map uses the
    sheet's side padding to keep this width and its touch-target spacing. */
export const MAP_WIDTH = 320;
/* MAP_SCALE and MAP_HEIGHT stay exported only for their own test (AU-09
   test-only review); the component takes the box from MAP_WIDTH and
   MAP_VIEW's ratio, so neither is a second copy of a size. */
export const MAP_SCALE = MAP_WIDTH / MAP_VIEW.width;
export const MAP_HEIGHT = MAP_VIEW.height * MAP_SCALE;

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

/** The visible dot inside the touch target, which is what has to sit on the
    body rather than over the edge of it. The component draws it from this
    number, so the test and the drawing cannot drift. */
export const MAP_DOT_SIZE = 22;

/** Store right-hand dot coordinates in body units and mirror each
    left-hand dot. Check spansAt so sites stay on the silhouette.
    Between shoulder y=48 and knee y=132.8, six rows use 17.5-unit
    spacing for 48px targets and 8px gaps. Each pair sits at least
    9 units to either side of the midline. */
const PLACEMENT: Record<InjectionSiteRegion, Pt> = {
  deltoid: { x: 74, y: 49 },
  abdomen: { x: 59, y: 58.5 },
  loveHandle: { x: 63.5, y: 75.5 },
  ventrogluteal: { x: 59, y: 92.5 },
  dorsogluteal: { x: 59, y: 110 },
  thigh: { x: 59, y: 127.5 }
};

/** A site's dot in the figure's own units, which is where it can be asked
    whether it is on the body. */
export function sitePoint(site: InjectionSite): Pt {
  const place = PLACEMENT[site.region];
  return { x: site.side === 'left' ? FIGURE_BOX.width - place.x : place.x, y: place.y };
}

/** The same dot as percentages of the box, for the component's inline
    `top`/`left`. The map's viewBox is the figure's width across, so an x in
    figure units is already a percentage of the box. */
export function sitePosition(site: InjectionSite): { top: number; left: number } {
  const { x, y } = sitePoint(site);
  return { top: (y / MAP_VIEW.height) * 100, left: x };
}

/** The same point in CSS px at the size the map actually renders at, which
    is the only unit a touch target can be compared against. */
/* siteCentre stays exported only for its own test (AU-09 test-only review). */
export function siteCentre(site: InjectionSite): Pt {
  const { x, y } = sitePoint(site);
  return { x: x * MAP_SCALE, y: y * MAP_SCALE };
}
