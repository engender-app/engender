/* Where the body map's nine shapes sit, and which region goes where (phase
   10 redesign ticket 40).

   Beside BodyRegionMap.svelte for the same reason injectionSiteMap.ts sits
   beside the injection map: the arrangement makes two claims a component's
   <style> block is not somewhere a test can ask about. The shapes must not
   overlap, or a tap lands on two regions at once; and every shape must be
   centred on the midline, which is what makes the figure neutral.

   Neutral by construction, not by careful drawing. There is no body
   outline here, so there is no contour to carry a waist, a bust or a set of
   hips - the shapes in a body arrangement are the whole picture. That
   matters most for exactly the three regions where getting it wrong costs
   most: chest, hips_waist and genitals, each of which is a centred block
   whose width says nothing about the body under it.

   This replaces HOTSPOTS, the hand-written table of eight {region, top%,
   left%} triples the old screen floated dots on. The difference is not that
   the numbers moved: a hotspot was a dot over a drawing that had no
   matching part, and a slot is the drawing. */

import { BODY_REGION_INTENSITY_MAX, BODY_REGION_INTENSITY_MIN } from '../data/bodyMap';
import type { RegionSideReading } from '../data/bodyMap';
import { heatLevel } from '../data/metricRange';
import type { BodyRegion } from '../data/types';

/** The figure's own coordinate space. Percentages are taken against these,
    so the arrangement is written in round numbers and scales with whatever
    width the screen gives it. Taller than wide, because a body is. */
export const FIGURE_BOX = { width: 100, height: 135 } as const;

/** The stage's width in CSS px (`max-width` on `.region-stage`) and the
    height its aspect ratio gives that width. */
export const STAGE_WIDTH = 320;
export const STAGE_HEIGHT = (STAGE_WIDTH * FIGURE_BOX.height) / FIGURE_BOX.width;

/** `--touch-target` in box units. Independent of the box's height: the unit
    is set by the stage's width, so this is 4800 / STAGE_WIDTH whatever
    proportion the figure is drawn at. */
export const TOUCH_UNITS = (48 * FIGURE_BOX.height) / STAGE_HEIGHT;

export interface FigureSlot {
  region: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The region drawn as the ground the other eight sit on, which is
    literally what it means. It gives the arrangement its connective tissue
    without a label, and it is a real region with a real reading rather than
    a decorative silhouette - tapping it selects it like any other. */
export const GROUND_REGION = 'whole_body';

/** The ground's own shape: the whole box, because the eight sit *on* it and
    what is left over is the only part of it a finger can reach.

    That leftover has to be a target in its own right. The eight cover the
    ground's middle, so the clear band below the last of them is where a tap
    meant for the whole body goes - one touch target tall, the full width of
    the figure. */
export const GROUND_SLOT: FigureSlot = {
  region: GROUND_REGION,
  left: 0,
  top: 0,
  width: FIGURE_BOX.width,
  height: FIGURE_BOX.height
};

/* Down the body, which is both the reading order and the order the shapes
   arrive in. Widths and heights both vary, because an even rhythm of
   same-sized bars reads as a ladder: a throat is narrow and short where a
   set of shoulders is wide and thin, which is true of every body and says
   nothing about any one of them.

   These are the rects that are **drawn**. What a finger hits is `hitBox`
   below, which is the same rect grown to the touch floor - the ticket's own
   rule, and InjectionSiteMap's: a real button over the drawing. Holding the
   two apart is what lets the drawing have a 22px hairline and a 51px chest
   without the figure needing 8 x 48px of stacked shapes plus their gaps,
   which came to 602px and filled a phone screen on its own.

   The gaps between drawn shapes are uneven and never under 10px: each shape
   wears a 5px ring of the card's own surface to lift it off the ground's
   fill, and two neighbours' rings may not touch.

   Every shape is centred on its own touch band - eight bands of 48px
   tiling the figure above the ground's - because the buttons have to tile
   exactly for all eight of them plus the ground's own band to fit, and a
   shape drawn off its band's centre pushes its button into a neighbour's.
   The tests hold both halves of that. */
export const FIGURE_SLOTS: FigureSlot[] = [
  { region: 'hairline', left: 39, top: 4, width: 22, height: 7 },
  { region: 'face_jaw', left: 35, top: 17, width: 30, height: 11 },
  { region: 'voice_throat', left: 43.5, top: 33, width: 13, height: 9 },
  { region: 'shoulders', left: 9, top: 48, width: 82, height: 9 },
  { region: 'chest', left: 24, top: 61.5, width: 52, height: 12 },
  { region: 'hips_waist', left: 28, top: 77, width: 44, height: 11 },
  { region: 'genitals', left: 40, top: 93, width: 20, height: 9 },
  { region: 'hands_feet', left: 17, top: 108, width: 66, height: 9 }
];

/** What a finger hits: the drawn rect grown about its own centre until
    neither side is under the touch floor. Never smaller than what is drawn,
    so a big shape keeps its whole area.

    The drawing and the target are two different rectangles on purpose. A
    hotspot could be a 14px dot because the button around it was 48px; the
    old figure got that right and got everything else wrong. Here the shape
    is what carries the reading and the button is what carries the tap, and
    `bodyRegionFigure.test.ts` holds the rule that no two buttons overlap -
    a tap has to land on exactly one region. */
export function hitBox(slot: FigureSlot): FigureSlot {
  const grow = (start: number, size: number, limit: number) => {
    const target = Math.max(size, TOUCH_UNITS);
    const at = Math.min(Math.max(start - (target - size) / 2, 0), limit - target);
    return { start: at, size: target };
  };
  const x = grow(slot.left, slot.width, FIGURE_BOX.width);
  const y = grow(slot.top, slot.height, FIGURE_BOX.height);
  return { region: slot.region, left: x.start, top: y.start, width: x.size, height: y.size };
}

const SLOT_BY_REGION = new Map(FIGURE_SLOTS.map((slot) => [slot.region, slot]));

export interface FigurePlacement {
  /** The slots that have a region to draw, in body order. A built-in
      somebody hid or deleted is simply absent - the remaining shapes keep
      their own places rather than shuffling up, because a shape's position
      is what says which part of the body it is. */
  slots: { slot: FigureSlot; region: BodyRegion }[];
  ground: BodyRegion | null;
  /** Everything with nowhere on the figure: `body_facial_hair`, which has
      no one place on a body, and every region somebody added themselves.
      Drawn docked to the figure in the same shape language, so a region
      someone added gets the same affordance chest has from the first time
      they add one. */
  elsewhere: BodyRegion[];
}

/** Sort the regions somebody has into the figure, its ground and the
    elsewhere cluster. Every region goes somewhere: the cluster is the
    catch-all, so a region this build has never heard of is still reachable. */
export function placeRegions(regions: BodyRegion[]): FigurePlacement {
  const byId = new Map(regions.map((region) => [region.id, region]));
  const slots = FIGURE_SLOTS.flatMap((slot) => {
    const region = byId.get(slot.region);
    return region ? [{ slot, region }] : [];
  });
  return {
    slots,
    ground: byId.get(GROUND_REGION) ?? null,
    elsewhere: regions.filter((region) => region.id !== GROUND_REGION && !SLOT_BY_REGION.has(region.id))
  };
}

/** Which step of the role's heat ramp a region's reading paints (roles.ts
    builds one per stripe, and kit-roles.test.ts holds every step's ink to
    4.5:1 against its own fill).

    The app's own intensity ramp, reused rather than invented: a calendar
    cell, a week cell, an injection dot and a body region now shade one
    reading the same way and only the hue differs. Level 0 is the region
    with no readings in the range, drawn as an outline and no fill - neither
    a large number nor zero reads as "never". */
export function fillLevel(reading: RegionSideReading | null | undefined): number {
  if (!reading || reading.value === null) return 0;
  return heatLevel(reading.value, { min: BODY_REGION_INTENSITY_MIN, max: BODY_REGION_INTENSITY_MAX });
}

/** A slot as the four percentages that place a box on the stage. */
export function slotStyle(slot: FigureSlot): string {
  const pct = (value: number, of: number) => `${((value / of) * 100).toFixed(3)}%`;
  return [
    `left:${pct(slot.left, FIGURE_BOX.width)}`,
    `top:${pct(slot.top, FIGURE_BOX.height)}`,
    `width:${pct(slot.width, FIGURE_BOX.width)}`,
    `height:${pct(slot.height, FIGURE_BOX.height)}`
  ].join(';');
}
