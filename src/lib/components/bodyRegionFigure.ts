/* The body map's drawing and its hit zones (phase 10 redesign ticket 40).

   Beside BodyRegionMap.svelte for the same reason injectionSiteMap.ts sits
   beside the injection map: the arrangement makes claims a component's
   <style> block is not somewhere a test can ask about. No two zones may
   overlap, or a tap lands on two regions at once; no zone may be under the
   touch floor at the smallest stage the app can give it; and every shape a
   person can see has to sit inside a zone that selects the region it belongs
   to, or the figure shows one thing and answers with another.

   **The regions are the drawing, and the drawing is a body.** Four earlier
   arrangements failed on that sentence's two halves: eight rounded
   rectangles in a column were regions and no body ("why is there no body?"),
   a wooden mannequin and a capsule silhouette were bodies the regions only
   sat on top of, and dots on that silhouette carried the data without the
   figure ever being made of it (Alicja, 2026-09-14, on the last of them:
   "wrong proportions, looks janky and bad"). So the figure is one silhouette
   tiled into panels, a panel per region, each panel separated from its
   neighbours by a seam of the card's own colour. A region is a piece of the
   body rather than a mark placed on one.

   **Neutral means the outline is neutral, not that there is no outline.**
   Two things carry it here, and both are tests. The trunk is a single
   constant-width block from the collar to the crotch, so there is no waist
   to pull in, no bust to push out and no hips to flare; and every panel
   across it is that same width, so nothing the data draws can put a shape
   back that the silhouette left out. The head, arms and legs are plain
   blocks mirrored about the midline.

   **The proportions are the canon**, which is what the previous drawing got
   wrong: seven heads tall, head 25 units, crown at y=8 and the crotch at
   y=96, exactly half the figure's height. Fingertips reach mid-thigh, the
   knee sits at 5.2 heads and the shoulders are 2.2 heads across. The box is
   sized so that the smallest stage the component allows - 300 x 528 - puts
   16 units on 48px, which is what lets a band of the trunk be a touch
   target without the figure being stretched to reach one.

   `whole_body` is the silhouette under the panels: it carries its own
   reading as the fill of the limbs and the seams between the panels, and
   takes a tap wherever no panel is. That is what "the ground the other eight
   sit on" means, and it is why this replaces HOTSPOTS rather than moving its
   numbers. A hotspot was a dot over a drawing with no matching part; these
   are the parts. */

import { BODY_REGION_INTENSITY_MAX, BODY_REGION_INTENSITY_MIN } from '../data/bodyMap';
import type { RegionSideReading } from '../data/bodyMap';
import { heatLevel } from '../data/metricRange';
import type { BodyRegion } from '../data/types';

/** The drawing's own coordinate space, which is also the SVG's viewBox.
    100 x 176 is seven heads of 25 units with the crown 8 units down, and it
    is also 300 x 528 at the smallest stage - the ratio that puts a 16-unit
    band on exactly 48px. */
export const FIGURE_BOX = { width: 100, height: 176 } as const;

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A rounded rectangle. Everything here is one of these, the silhouette
    included, so the geometry stays checkable with one set of helpers. */
export interface Shape extends Box {
  r: number;
}

export const GROUND_REGION = 'whole_body';

/* The silhouette. Its pieces overlap deliberately - the neck runs into the
   head and the torso, the thighs into the pelvis - so the union has no
   internal joint; the component paints it in two passes, an outline layer
   and then a fill layer, so only the outer contour keeps a line.

   The arms hang clear of the trunk below a short joint at the shoulder,
   which is the one thing the old drawing had no room for: without that
   notch the shoulders, the upper arms and the chest are a single slab
   fifty-five units wide and the figure stops reading as a body.

   A limb is one width the whole way down - no elbow, no knee, no ankle
   (Alicja, 2026-09-14: "make the hands and legs the same width throughout
   the whole limb"). The taper this replaces was doing the opposite of what
   the drawing is for: an arm that narrows at the forearm and swells again
   at the hand is anatomy, and anatomy is what the neutrality rule spends
   its budget avoiding. So an arm is one block from the shoulder to the
   fingertips and a leg is one block from the hip to the sole; the hand and
   the foot are panels drawn on them rather than shapes of their own. */
export const GROUND_SHAPES: Shape[] = [
  { left: 40, top: 8, width: 20, height: 25, r: 5 }, // head
  { left: 44, top: 29, width: 12, height: 13, r: 2 }, // neck
  { left: 28, top: 40, width: 44, height: 56, r: 3 }, // trunk, collar to crotch
  { left: 25.5, top: 40, width: 6, height: 9, r: 2 }, // shoulder joints
  { left: 68.5, top: 40, width: 6, height: 9, r: 2 },
  { left: 14.5, top: 40, width: 12, height: 66, r: 3 }, // arms, shoulder to fingertip
  { left: 73.5, top: 40, width: 12, height: 66, r: 3 },
  { left: 30, top: 92, width: 17, height: 82, r: 3 }, // legs, hip to sole
  { left: 53, top: 92, width: 17, height: 82, r: 3 }
];

/** The trunk: the one piece the neutrality rule is actually about, named
    rather than indexed so the test says what it is checking. One width from
    the collar to the crotch, centred on the midline. */
export const TRUNK = GROUND_SHAPES[2];

/** How far a panel is inset from the band it fills, so two neighbours are
    parted by twice this much. 0.75 of 176 units is 4.5px at the minimum
    stage - the app's 3px seam, give or take the half-pixel a scaled
    viewBox costs. */
export const SEAM = 0.75;

/** A region's own piece of the body, and the button over it.

    `shapes` is what is drawn: more than one where the region is in more than
    one place on a body - `shoulders` gets an arm each, `hands_feet` gets two
    hands and two feet - and `boxes` holds one button per shape. A region in
    several places is still one region with one accessible name, so only the
    first button is a real control; the rest are aria-hidden and out of the
    tab order, so a screen reader hears one control while a finger can reach
    any of them. */
export interface RegionPanel {
  region: string;
  shapes: Shape[];
  boxes: Box[];
}

/* Down the body, which is the reading order and the order the panels arrive
   in. The six boxes down the middle tile the column from the crown to the
   crotch at 16 units each, so a tap between two of them is impossible; the
   four at the sides and the two at the feet take the space beside the
   figure, which nothing else uses.

   A box is bigger than the shape it selects wherever the body part is
   smaller than a finger - the head is 20 units across and a hand is 12 - and
   `bodyRegionFigure.test.ts` holds the two rules that keeps honest: every
   shape lies wholly inside its own box, and no two boxes overlap. */
export const REGION_PANELS: RegionPanel[] = [
  {
    region: 'hairline',
    shapes: [{ left: 40.75, top: 9, width: 18.5, height: 6, r: 3 }],
    boxes: [{ left: 28, top: 0, width: 44, height: 16 }]
  },
  {
    region: 'face_jaw',
    shapes: [{ left: 40.75, top: 16.5, width: 18.5, height: 15, r: 2 }],
    boxes: [{ left: 28, top: 16, width: 44, height: 16 }]
  },
  {
    /* The throat and the collar it runs into: the neck alone is 12 units
       across and would be a shape nothing could point at. */
    region: 'voice_throat',
    shapes: [
      { left: 44.75, top: 33, width: 10.5, height: 9, r: 2 },
      { left: 28.75, top: 41, width: 42.5, height: 6.25, r: 2 }
    ],
    boxes: [{ left: 28, top: 32, width: 44, height: 16 }]
  },
  {
    /* The tops of both arms, which is where a shoulder is. Off the trunk's
       column on purpose: six bands of 48px between the crown and the crotch
       is already the whole half of a 528px figure, and a seventh would make
       the trunk longer than the legs. */
    region: 'shoulders',
    shapes: [
      { left: 15.25, top: 40.75, width: 10.5, height: 15, r: 2 },
      { left: 74.25, top: 40.75, width: 10.5, height: 15, r: 2 }
    ],
    boxes: [
      { left: 0, top: 38, width: 28, height: 22 },
      { left: 72, top: 38, width: 28, height: 22 }
    ]
  },
  {
    region: 'chest',
    shapes: [{ left: 28.75, top: 48.75, width: 42.5, height: 14.5, r: 2 }],
    boxes: [{ left: 28, top: 48, width: 44, height: 16 }]
  },
  {
    region: 'hips_waist',
    shapes: [{ left: 28.75, top: 64.75, width: 42.5, height: 14.5, r: 2 }],
    boxes: [{ left: 28, top: 64, width: 44, height: 16 }]
  },
  {
    region: 'genitals',
    shapes: [{ left: 28.75, top: 80.75, width: 42.5, height: 14.5, r: 2 }],
    boxes: [{ left: 28, top: 80, width: 44, height: 16 }]
  },
  {
    region: 'hands_feet',
    shapes: [
      { left: 14.75, top: 94.75, width: 10.5, height: 10.5, r: 2 },
      { left: 74.75, top: 94.75, width: 10.5, height: 10.5, r: 2 },
      { left: 30.75, top: 164.75, width: 15.5, height: 8.5, r: 2 },
      { left: 53.75, top: 164.75, width: 15.5, height: 8.5, r: 2 }
    ],
    boxes: [
      { left: 0, top: 88, width: 28, height: 22 },
      { left: 72, top: 88, width: 28, height: 22 },
      { left: 28, top: 158, width: 22, height: 18 },
      { left: 50, top: 158, width: 22, height: 18 }
    ]
  }
];

/** The panels that tile the trunk's column, by region. All one width, which
    is the trunk's own: the neutrality rule holds for what the data draws as
    well as for the silhouette, since a chest panel drawn wider than a waist
    panel would put a shape back that the outline left out. */
export const TRUNK_PANELS = ['voice_throat', 'chest', 'hips_waist', 'genitals'];

/** Every button on the figure, in body order, with the region each belongs
    to and whether it is that region's real control. */
export function hitBoxes(): { region: string; box: Box; primary: boolean }[] {
  return REGION_PANELS.flatMap((panel) =>
    panel.boxes.map((box, i) => ({ region: panel.region, box, primary: i === 0 }))
  );
}

/** Where a tap means the whole body: the whole figure, underneath the
    panels, so it is reached wherever none of them is - the limbs, the seams
    and the space around the drawing. */
export const GROUND_ZONE: Box = {
  left: 0,
  top: 0,
  width: FIGURE_BOX.width,
  height: FIGURE_BOX.height
};

const PANEL_BY_REGION = new Map(REGION_PANELS.map((panel) => [panel.region, panel]));

/** `--touch-target`, which is Android's 48dp floor and the stricter of the
    two platforms this ships on. */
export const TOUCH_PX = 48;

/* The stage cannot be given a fixed size and then assumed, which is exactly
   the bug an earlier review's browser pass found: the module claimed a 320px
   stage and the card's own padding rendered it at 314, so every button came
   out 47.09px - each of them under the floor by the same 2%, because a box
   is a percentage of whatever the stage turned out to be.

   So the floor is derived from the boxes instead. A box `n` units tall of
   176 needs a stage of 48 * 176 / n to be 48px tall, and the same sum across
   for its width; the stage also holds its aspect ratio, so a height floor is
   a width floor too. The component puts both on the stage as a `min-width`
   and a `min-height`, and the stage grows past its ratio rather than
   shrinking a target. */
const boxes = hitBoxes().map(({ box }) => box);
export const MIN_STAGE_HEIGHT = Math.ceil(
  Math.max(...boxes.map((box) => (TOUCH_PX * FIGURE_BOX.height) / box.height))
);
export const MIN_STAGE_WIDTH = Math.max(
  Math.ceil(Math.max(...boxes.map((box) => (TOUCH_PX * FIGURE_BOX.width) / box.width))),
  Math.ceil((MIN_STAGE_HEIGHT * FIGURE_BOX.width) / FIGURE_BOX.height)
);

/** What a box measures on a stage of this size, in CSS px. The test walks
    every button through it at `MIN_STAGE_WIDTH` x `MIN_STAGE_HEIGHT`, which
    is the smallest the component will ever let the stage be. */
export function zonePx(zone: Box, stageWidth: number, stageHeight: number): { w: number; h: number } {
  return {
    w: (zone.width / FIGURE_BOX.width) * stageWidth,
    h: (zone.height / FIGURE_BOX.height) * stageHeight
  };
}

export interface FigurePlacement {
  /** The regions with a panel on the figure, in body order. A built-in
      somebody hid or deleted is simply absent; the rest keep their places,
      because where a panel sits is what says which part of the body it is. */
  drawn: { panel: RegionPanel; region: BodyRegion }[];
  ground: BodyRegion | null;
  /** Everything with nowhere on the figure: `body_facial_hair`, which has no
      one place on a body, and every region somebody added themselves. */
  elsewhere: BodyRegion[];
}

export function placeRegions(regions: BodyRegion[]): FigurePlacement {
  const byId = new Map(regions.map((region) => [region.id, region]));
  return {
    drawn: REGION_PANELS.flatMap((panel) => {
      const region = byId.get(panel.region);
      return region ? [{ panel, region }] : [];
    }),
    ground: byId.get(GROUND_REGION) ?? null,
    elsewhere: regions.filter(
      (region) => region.id !== GROUND_REGION && !PANEL_BY_REGION.has(region.id)
    )
  };
}

/** Which step of the role's heat ramp a region's reading paints (roles.ts
    builds one per stripe, and kit-roles.test.ts holds every step's ink to
    4.5:1 against its own fill).

    The app's own intensity ramp, reused rather than invented: a calendar
    cell, a week cell, an injection dot and a body region now shade one
    reading the same way and only the hue differs. Level 0 is a region with
    no readings in the range, drawn as an outline and no fill - neither a
    large number nor zero reads as "never". */
export function fillLevel(reading: RegionSideReading | null | undefined): number {
  if (!reading || reading.value === null) return 0;
  return heatLevel(reading.value, { min: BODY_REGION_INTENSITY_MIN, max: BODY_REGION_INTENSITY_MAX });
}

/** A box as the four percentages that place an element over the stage. */
export function boxStyle(box: Box): string {
  const pct = (value: number, of: number) => `${((value / of) * 100).toFixed(3)}%`;
  return [
    `left:${pct(box.left, FIGURE_BOX.width)}`,
    `top:${pct(box.top, FIGURE_BOX.height)}`,
    `width:${pct(box.width, FIGURE_BOX.width)}`,
    `height:${pct(box.height, FIGURE_BOX.height)}`
  ].join(';');
}

/** Whether two boxes share any area. */
export function overlaps(a: Box, b: Box): boolean {
  return (
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  );
}

/** Whether `inner` lies wholly within `outer`. */
export function contains(outer: Box, inner: Box): boolean {
  return (
    inner.left >= outer.left &&
    inner.top >= outer.top &&
    inner.left + inner.width <= outer.left + outer.width &&
    inner.top + inner.height <= outer.top + outer.height
  );
}

/** The shape a panel's seam is cut from: the panel grown back out to its
    band, painted in the card's own colour under the panel. It is what keeps
    a panel apart from the ground and from its neighbours whatever the two
    are filled with - two readings a step apart on the ramp are close enough
    to merge across a shared edge. */
export function matShape(shape: Shape): Shape {
  return {
    left: shape.left - SEAM,
    top: shape.top - SEAM,
    width: shape.width + SEAM * 2,
    height: shape.height + SEAM * 2,
    r: shape.r + SEAM
  };
}

/** Where a panel's mixed mark goes: inside the shape, at its trailing edge,
    in the ink the ramp computes for that step. On the panel rather than
    beside it, which a dot had no room for - the bars are read off the fill
    they sit on, and roles.ts holds every step's ink to 4.5:1 against it. */
export const MARK = { width: 4.6, height: 1.6, gap: 1.8 } as const;

/** The shape a region's mark goes on: the widest it draws, since a region
    in several places has to mark one of them and the widest is the one with
    room. */
export function markShape(shapes: Shape[]): Shape {
  return shapes.reduce((widest, shape) => (shape.width > widest.width ? shape : widest), shapes[0]);
}

export function markAt(shape: Shape): { x: number; y: number } {
  return {
    x: shape.left + shape.width - MARK.width - 1.8,
    y: shape.top + shape.height / 2 - MARK.height - MARK.gap / 2
  };
}
