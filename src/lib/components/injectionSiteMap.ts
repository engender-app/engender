/* Where the rotation map's twelve dots sit (phase 4 ticket 02, re-spaced in
   phase 6 ticket 13, re-placed against the shared silhouette in phase 11
   ticket 48).

   Beside InjectionSiteMap.svelte rather than inside it because the spacing
   is the only claim the map makes that can be got wrong silently: twelve
   touch targets on one small figure either stay separate or quietly overlap,
   and a component's <style> block is not somewhere a test can ask. */

import type { InjectionSite, InjectionSiteRegion } from '../data/doseSchedule';
import { FIGURE_BOX, type Pt } from './bodySilhouette';

/** The part of the silhouette the map frames, in the figure's own units.

    The shared body is 100 x 176 from the crown to the soles (ADR-0087), and
    this map shows the first 135 of it: the head, the arms, the torso and the
    legs to just above the knee. The shins are out of frame for the reason
    the drawing this replaces had none - every one of the twelve sites is
    above the knee, so 41 units of leg would be picture carrying no site.

    It is a frame rather than a cap, and it is the resolution of a conflict
    the ticket asked to have stated rather than settled quietly. Twelve 48px
    targets 8px apart need the body drawn at least 312px wide whatever else
    is true, because a dot has to stay on the part it names and this body is
    35 units across the torso. At 312px wide the whole 176 units are 549px
    tall, and the sheet scrolls its content in a 505px window, so the figure
    and its caption could not be seen at once. Framing the top 135 units at
    320px wide is 432px, which can. */
export const MAP_VIEW = { width: FIGURE_BOX.width, height: 135 } as const;

/** The figure's box in CSS px, and the px each figure unit is drawn at.

    320px is as wide as the map goes: the dose sheet gives its content a
    350px column on a 390px phone, and a 360px phone - the narrowest this
    app is built for - gives exactly 320, so the spacing the test holds is
    the spacing that phone draws rather than one only a large phone gets. */
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

/** Where each region sits on the silhouette, in the figure's own units: the
    right-hand dot of the pair, which the left one mirrors.

    Stated in figure units rather than as percentages of the box, because
    what a dot has to be on is the drawing - `spansAt` says how wide the
    body is at a height, and the test asks it in these coordinates.

    Six rows have to come down a body between the shoulder (the arm leaves
    the torso at y=48) and the knee (y=132.8), and 48px plus 8px of clear
    space is 17.5 units at the size this renders at, so the rows are 17.5
    apart and the whole run is spent. That is what fixes a row's height:
    every one of them is as high up the body as the row above it allows. The
    body is 35 units across the torso, so the left/right pair carries the
    same constraint sideways - 9 units either side of the midline is the
    narrowest a pair may be, which is why the abdomen's dots sit well in from
    the flank while the love handles sit on it. */
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
