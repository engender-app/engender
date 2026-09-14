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
export const FIGURE_BOX = { width: 100, height: 166 } as const;

/** The stage's width in CSS px (`max-width` on `.region-stage`) and the
    height its aspect ratio gives that width. The height is what every slot
    is sized against: `--touch-target` is 48px, which is 15 box units here,
    so no shape may be shorter than that however narrow it is drawn. A
    hotspot could be 14px across because the button around it was 48; a
    shape is its own hit target, so the drawing carries the floor. */
export const STAGE_WIDTH = 320;
export const STAGE_HEIGHT = (STAGE_WIDTH * FIGURE_BOX.height) / FIGURE_BOX.width;

/** The shortest a slot may be drawn, in box units: 48 CSS px at the stage's
    own size. */
export const MIN_SLOT_UNITS = (48 * FIGURE_BOX.height) / STAGE_HEIGHT;

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

/** The ground's own shape, inset from the box so the eight never touch its
    edge. */
export const GROUND_SLOT: FigureSlot = { region: GROUND_REGION, left: 4, top: 0, width: 92, height: 166 };

/* Down the body, which is both the reading order and the order the shapes
   arrive in. Widths vary so the arrangement reads as a figure rather than
   as a ladder - a throat is narrow and a set of shoulders is wide, which is
   true of every body and says nothing about any one of them.

   The gaps are deliberate and uneven. Adjacent shapes never share an edge,
   so a tap that lands between two of them lands on the ground (whole_body)
   rather than on whichever neighbour happened to win - but the sizes of
   those gaps are doing a second job: an even rhythm reads as a ladder, and
   the head group sitting close together with more air before the shoulders
   is most of what makes this read as a body at all. The floor on a gap is
   3 units - 9.6px at the stage's size - because each shape wears a 5px ring
   of card surface to lift it off the ground, and two neighbours' rings may
   not touch. Every height is at or
   above the touch floor, which leaves less room for variation than a
   drawing would want, so the widths carry the silhouette. */
export const FIGURE_SLOTS: FigureSlot[] = [
  { region: 'hairline', left: 39, top: 2, width: 22, height: 15 },
  { region: 'face_jaw', left: 35, top: 21, width: 30, height: 17 },
  { region: 'voice_throat', left: 43.5, top: 43, width: 13, height: 15 },
  { region: 'shoulders', left: 9, top: 63, width: 82, height: 15 },
  { region: 'chest', left: 24, top: 82, width: 52, height: 21 },
  { region: 'hips_waist', left: 28, top: 107, width: 44, height: 18 },
  { region: 'genitals', left: 40, top: 129, width: 20, height: 15 },
  { region: 'hands_feet', left: 17, top: 148, width: 66, height: 15 }
];

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

/** A slot as the four percentages that place its button. */
export function slotStyle(slot: FigureSlot): string {
  const pct = (value: number, of: number) => `${((value / of) * 100).toFixed(3)}%`;
  return [
    `left:${pct(slot.left, FIGURE_BOX.width)}`,
    `top:${pct(slot.top, FIGURE_BOX.height)}`,
    `width:${pct(slot.width, FIGURE_BOX.width)}`,
    `height:${pct(slot.height, FIGURE_BOX.height)}`
  ].join(';');
}
