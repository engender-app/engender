/* The body map's panels and its hit zones (phase 10 redesign ticket 40,
   redrawn for phase 11 ticket 47).

   Beside BodyRegionMap.svelte for the same reason injectionSiteMap.ts sits
   beside the injection map: the arrangement makes claims a component's
   <style> block is not somewhere a test can ask about. No two zones may
   overlap, or a tap lands on two regions at once; no zone may be under the
   touch floor at the smallest stage the app can give it; and every shape a
   person can see has to sit inside a zone that selects the region it
   belongs to, or the figure shows one thing and answers with another.

   **The regions are the drawing, and the drawing is a body.** That sentence
   survives four failed arrangements and one that was right about the
   sentence and wrong about the drawing. Eight rounded rectangles in a
   column were regions and no body ("why is there no body?"); a wooden
   mannequin and a capsule silhouette were bodies the regions only sat on
   top of; dots on that silhouette carried the data without the figure being
   made of it. What replaced them was one silhouette tiled into panels - the
   right idea - assembled out of nine rounded rectangles parted by seams of
   card colour, which is the drawing this file no longer holds (Alicja,
   2026-09-21: "it looks really bad, blocky, amateurish").

   **A panel is now a band of the shared silhouette, clipped.** The body
   itself lives in `bodySilhouette.ts` (ADR-0087) as one path; a region owns
   a rectangular band of it, and what gets drawn is the band intersected
   with the body, so every panel edge follows the body's own contour and
   neighbours are parted by a hairline in the region's own ink rather than
   by a gap. `GROUND_SHAPES`, `SEAM` and `matShape` retired with the
   rectangles: there is no seam to cut and no shape of a region's own to
   grow it out of.

   **A band is a window, not the panel.** It is deliberately a little wider
   than the body it selects - the trunk's bands run to x=32 and x=68 where
   the torso reaches 32.2 and 67.8 - so that the clip, rather than the
   number written here, decides where a panel ends. Where two regions divide
   one piece of the body across its width (the shoulder, where the arm meets
   the torso), the window edge is the seam, and the hairline drawn on it is
   the only straight edge left in the figure.

   **Neutrality is not enforced here any more.** It was, when the panels
   were rectangles and one of them drawn wider than another would have put
   a bust back on a flat silhouette. A clipped band is as wide as the body
   is at that height and cannot disagree with it, so the three measurements
   live on the path in `bodySilhouette.test.ts`.

   `whole_body` is the silhouette under the panels: it carries its own
   reading as the fill of the limbs and takes a tap wherever no panel is.
   That is what "the ground the other eight sit on" means. */

import { BODY_REGION_INTENSITY_MAX, BODY_REGION_INTENSITY_MIN } from '../data/bodyMap';
import type { RegionSideReading } from '../data/bodyMap';
import { heatLevel } from '../data/metricRange';
import type { BodyRegion } from '../data/types';
import { CANON, FIGURE_BOX, MIDLINE, spansAt } from './bodySilhouette';
import type { Pt } from './bodySilhouette';

export { FIGURE_BOX };

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const GROUND_REGION = 'whole_body';

/** The figure's three columns. The middle one is the head, the neck and the
    torso; the outer two are the arms, and the space beside the drawing that
    nothing else uses. A band and the button over it are cut from the same
    column, so what a panel paints and what a tap answers cannot drift
    apart.

    Where the edge sits is a drawing decision rather than a round number. A
    band is a window on the body and its hairline is that band's own
    outline, so a side edge that grazes the body draws a straight line down
    the side of it - which is how the picked panel first came out as a
    rectangle over a torso. 69.2 clears the torso, which reaches 67.8, by
    four pixels at every stage the component allows, and stays inside the
    nearest arm, which comes no closer in than 70.6. The one height where
    body does cross it is the shoulder, y 42 to 47, where the arm and the
    torso divide one mass between them and the line is the seam. */
const COLUMN = { left: 30.8, right: 69.2 } as const;
const SIDE = FIGURE_BOX.width - COLUMN.right;

/** A region's own band of the body, and the buttons over it.

    `bands` is what is drawn: more than one where the region is in more than
    one place on a body - `shoulders` gets an arm each, `hands_feet` gets
    two hands and two feet - and `boxes` holds one button per band. A region
    in several places is still one region with one accessible name, so only
    the first button is a real control; the rest are aria-hidden and out of
    the tab order, so a screen reader hears one control while a finger can
    reach any of them. */
export interface RegionPanel {
  region: string;
  bands: Box[];
  boxes: Box[];
}

const band = (left: number, top: number, width: number, height: number): Box => ({
  left,
  top,
  width,
  height
});

const middle = (top: number, height: number): Box =>
  band(COLUMN.left, top, COLUMN.right - COLUMN.left, height);

/* Down the body, which is the reading order and the order the panels arrive
   in. The six bands down the middle column tile it from the crown to the
   crotch, flush, so there is no height at which a tap between two of them
   is possible and no gap of card colour inside the body. The arms take the
   side columns, and the feet the bottom of the middle one.

   A box is bigger than the band it selects wherever the body part is
   smaller than a finger - a hand is 5 units across and its button is 32 -
   and `bodyRegionFigure.test.ts` holds the two rules that keeps honest:
   every band's drawn shape lies inside its own box, and no two boxes
   overlap. */
export const REGION_PANELS: RegionPanel[] = [
  {
    region: 'hairline',
    bands: [middle(CANON.crown, 8)],
    boxes: [middle(0, 16)]
  },
  {
    region: 'face_jaw',
    bands: [middle(16, 16)],
    boxes: [middle(16, 16)]
  },
  {
    /* The throat and the collar it runs into, which on a drawn body is the
       neck and the yoke of both trapezius slopes: the neck alone is 10
       units across and would be a shape nothing could point at. */
    region: 'voice_throat',
    bands: [middle(CANON.chin, 16)],
    boxes: [middle(CANON.chin, 16)]
  },
  {
    /* The tops of both arms, which is where a shoulder is. In the side
       columns rather than the middle one: the arm is what a shoulder is
       made of here, and the seam between it and the torso is the column
       edge. */
    region: 'shoulders',
    bands: [band(0, CANON.collar, SIDE, 24), band(COLUMN.right, CANON.collar, SIDE, 24)],
    boxes: [band(0, CANON.collar, SIDE, 24), band(COLUMN.right, CANON.collar, SIDE, 24)]
  },
  {
    region: 'chest',
    bands: [middle(48, 16)],
    boxes: [middle(48, 16)]
  },
  {
    region: 'hips_waist',
    bands: [middle(64, 16)],
    boxes: [middle(64, 16)]
  },
  {
    region: 'genitals',
    bands: [middle(80, 16)],
    boxes: [middle(80, 16)]
  },
  {
    /* Two hands and two feet. The hands' bands start at the wrist, so the
       band is a hand rather than a dot on the end of an arm; the feet's
       start above the ankle for the same reason. */
    region: 'hands_feet',
    bands: [
      band(0, 100, SIDE, 16),
      band(COLUMN.right, 100, SIDE, 16),
      band(COLUMN.left, 158, MIDLINE - COLUMN.left, 18),
      band(MIDLINE, 158, MIDLINE - COLUMN.left, 18)
    ],
    boxes: [
      band(0, 96, SIDE, 22),
      band(COLUMN.right, 96, SIDE, 22),
      band(COLUMN.left, 156, MIDLINE - COLUMN.left, 20),
      band(MIDLINE, 156, MIDLINE - COLUMN.left, 20)
    ]
  }
];

/** Every button on the figure, in body order, with the region each belongs
    to and whether it is that region's real control. */
export function hitBoxes(): { region: string; box: Box; primary: boolean }[] {
  return REGION_PANELS.flatMap((panel) =>
    panel.boxes.map((box, i) => ({ region: panel.region, box, primary: i === 0 }))
  );
}

/** Where a tap means the whole body: the whole figure, underneath the
    panels, so it is reached wherever none of them is - the limbs between
    the shoulder and the hand, the legs, and the space around the drawing. */
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

/* ---- what a band actually draws -------------------------------------- */

/** How finely a band is sampled when its drawn shape is measured. A
    quarter of a unit is under a pixel at every stage the component allows,
    so a bounding box or a centroid read off it is the one a browser
    paints. */
const STEP = 0.25;

/** The widest run of body inside a band at one height, or nothing where the
    band is off the body. A run rather than a bounding interval: at the
    height of the chest, three pieces of body cross the figure and only one
    of them is the chest. */
function runAt(area: Box, y: number): [number, number] | null {
  const from = area.left;
  const to = area.left + area.width;
  let widest: [number, number] | null = null;
  for (const [a, b] of spansAt(y)) {
    const run: [number, number] = [Math.max(a, from), Math.min(b, to)];
    if (run[1] - run[0] <= 0) continue;
    if (!widest || run[1] - run[0] > widest[1] - widest[0]) widest = run;
  }
  return widest;
}

/** Every row of a band that has body in it, down the band a `STEP` at a
    time. Three things are measured off a band and each of them is this walk
    with a different accumulator. */
function eachRow(area: Box, visit: (y: number, run: [number, number]) => void): void {
  for (let y = area.top; y <= area.top + area.height + 1e-9; y += STEP) {
    const run = runAt(area, y);
    if (run) visit(y, run);
  }
}

/** The box a band's drawn shape actually occupies: the band intersected
    with the body. This is the containment rule's left-hand side - "every
    drawn shape lies inside its own box" became "every clipped band's
    bounding box lies inside its own box" when the panels stopped being
    shapes of their own (ADR-0087). */
export function bandBox(area: Box): Box {
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  eachRow(area, (y, run) => {
    left = Math.min(left, run[0]);
    right = Math.max(right, run[1]);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  });
  if (left === Infinity) return { left: area.left, top: area.top, width: 0, height: 0 };
  return { left, top, width: right - left, height: bottom - top };
}

/** How much body a band covers, in square units. Only ever compared with
    another band's, to decide which of a region's places carries its mark. */
function bandArea(area: Box): number {
  let total = 0;
  eachRow(area, (_, run) => {
    total += (run[1] - run[0]) * STEP;
  });
  return total;
}

/** Where a panel's mixed mark goes: two short bars in the ink the ramp
    computes for that step, on the band rather than beside it, so the bars
    are read off the fill they sit on (roles.ts holds every step's ink to
    4.5:1 against its own fill).

    The old mark sat at the trailing edge of a rounded rectangle. A clipped
    band has no straight trailing edge, so the mark moved to the middle of
    the band instead. */
export const MARK = { width: 3.8, height: 1.4, gap: 1.5 } as const;

const MARK_SPAN = MARK.height * 2 + MARK.gap;

/** The band a region's mark goes on: of a region's several places, the one
    with the most room for a mark, and the larger of two with equal room.
    `hands_feet` is the whole reason this is a choice - a foot is wider than
    a hand and its widest rows are its last ones, so the hand is the place
    with room even though the foot is the larger band. */
export function markBand(bands: Box[]): Box {
  return bands.reduce((best, area) => {
    const gap = markFit(area) - markFit(best);
    if (gap > 0.01) return area;
    if (gap < -0.01) return best;
    return bandArea(area) > bandArea(best) ? area : best;
  }, bands[0]);
}

/** The centre of the body a band covers, weighted by how much of it there
    is at each height. */
export function bandCentroid(area: Box): Pt {
  let x = 0;
  let y = 0;
  let total = 0;
  eachRow(area, (at, run) => {
    const width = run[1] - run[0];
    x += ((run[0] + run[1]) / 2) * width;
    y += at * width;
    total += width;
  });
  return total > 0 ? { x: x / total, y: y / total } : { x: MIDLINE, y: area.top };
}

/** How much clearance a mark keeps above and below itself, so a bar never
    lands flush against the contour - the sole and the fingertips are both
    places the widest rows of a band are also its last ones. */
const MARK_CLEAR = 0.5;

/** The rows a mark would occupy if it hung from `y`, plus its clearance,
    and the narrowest the body is across them. Its own walk rather than
    `eachRow`: a row with no body under it is the answer here - the mark
    would hang off the end of a foot - rather than a row to skip. */
function fitAt(area: Box, y: number): { fit: number; x: number } {
  let fit = Infinity;
  let sum = 0;
  let rows = 0;
  for (let at = y - MARK_CLEAR; at <= y + MARK_SPAN + MARK_CLEAR + 1e-9; at += STEP) {
    const run = runAt(area, at);
    if (!run) return { fit: 0, x: MIDLINE };
    fit = Math.min(fit, run[1] - run[0]);
    sum += (run[0] + run[1]) / 2;
    rows += 1;
  }
  return { fit, x: sum / rows };
}

/** The top left of the first bar: the band's own centroid, which on every
    band across the torso is the middle of it.

    Two of `hands_feet`'s four bands are the exception the search exists
    for. One runs from above the ankle to the sole and the other from the
    wrist to the fingertips, so the centroid of either lands on the
    narrowest part of it and a mark hung there would run off the body. Where
    the centroid cannot hold a mark, the mark moves to the nearest rows that
    can. */
export function markAt(area: Box): Pt {
  const floor = MARK.width + 0.5;
  const centroid = bandCentroid(area);
  const wanted = Math.min(
    Math.max(centroid.y - MARK_SPAN / 2, area.top + MARK_CLEAR),
    area.top + area.height - MARK_SPAN - MARK_CLEAR
  );
  const at = fitAt(area, wanted);
  if (at.fit >= floor) return { x: at.x - MARK.width / 2, y: wanted };

  let best: { fit: number; x: number; y: number } | null = null;
  for (let y = area.top + MARK_CLEAR; y <= area.top + area.height - MARK_SPAN - MARK_CLEAR + 1e-9; y += STEP) {
    const here = fitAt(area, y);
    const better =
      !best ||
      here.fit > best.fit + 1e-9 ||
      (here.fit > best.fit - 1e-9 && Math.abs(y - wanted) < Math.abs(best.y - wanted));
    if (here.fit > 0 && better) best = { ...here, y };
  }
  const pick = best ?? { ...at, y: wanted };
  return { x: pick.x - MARK.width / 2, y: pick.y };
}

/** The narrowest the body gets over the rows a mark occupies, which is what
    the mark has to fit inside. Read by the test rather than by the drawing. */
export function markFit(area: Box): number {
  return fitAt(area, markAt(area).y).fit;
}

/** Every region's mark, worked out once: the scans behind it are the same
    every time, and a selection change must not pay for them again. */
const MARK_ANCHOR = new Map(
  REGION_PANELS.map((panel) => {
    const area = markBand(panel.bands);
    return [panel.region, { band: area, at: markAt(area) }];
  })
);

export function markFor(region: string): { band: Box; at: Pt } | undefined {
  return MARK_ANCHOR.get(region);
}

/* ---- placement and paint --------------------------------------------- */

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
    no readings in the range, drawn in the silhouette's own neutral fill and
    no tint at all - neither a large number nor zero reads as "never", and a
    little colour would read as a little data. */
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
