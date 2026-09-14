/* The figure's geometry (phase 10 redesign ticket 40). Four properties, each
   of them something a <style> block cannot be asked about and a render will
   not reliably show: a tap lands on exactly one region, every button clears
   the touch floor at the smallest stage the component allows, every panel is
   a piece of the body it names, and the drawing says nothing about which
   body this is. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  FIGURE_BOX,
  GROUND_REGION,
  GROUND_SHAPES,
  GROUND_ZONE,
  MIN_STAGE_HEIGHT,
  MIN_STAGE_WIDTH,
  REGION_PANELS,
  SEAM,
  TOUCH_PX,
  TRUNK,
  TRUNK_PANELS,
  boxStyle,
  contains,
  fillLevel,
  hitBoxes,
  markAt,
  markShape,
  matShape,
  overlaps,
  placeRegions,
  zonePx
} from './bodyRegionFigure.ts';
import type { Box, Shape } from './bodyRegionFigure.ts';
import { BUILT_IN_BODY_REGIONS } from '../data/vocabulary/builtins.ts';

const region = (id: string, name = id) => ({ id, name, builtIn: true, hidden: false });
const centre = (box: Box) => box.left + box.width / 2;
const bottom = (box: Box) => box.top + box.height;

test('every built-in region is either a panel of the figure or its body', () => {
  const placed = new Set([...REGION_PANELS.map((p) => p.region), GROUND_REGION]);
  for (const key of BUILT_IN_BODY_REGIONS) {
    if (key === 'body_facial_hair') continue; // deliberately in the elsewhere cluster
    assert.ok(placed.has(key), `${key} has no place on the figure`);
  }
  assert.equal(REGION_PANELS.length, 8);
});

test('the panels run down the body, which is the order they arrive in', () => {
  assert.deepEqual(
    REGION_PANELS.map((p) => p.region),
    ['hairline', 'face_jaw', 'voice_throat', 'shoulders', 'chest', 'hips_waist', 'genitals', 'hands_feet']
  );
  const tops = REGION_PANELS.map((p) => p.shapes[0].top);
  assert.deepEqual([...tops].sort((a, b) => a - b), tops);
});

/* The neutrality rule, in the one place it lives.

   A contour is allowed - the figure is a body, and Alicja's own statement of
   the rule is that the outline has to be neutral rather than absent. What is
   not allowed is a trunk that pulls in at a waist, swells at a bust or
   flares at a hip, because those are the three that say which body this is,
   and they are exactly the three regions the ticket names as costing most to
   get wrong.

   One block from the collar to the crotch guarantees it for the silhouette.
   The panels need saying separately: the data draws on top of the outline,
   so a chest panel drawn wider than a waist panel would put back the shape
   the silhouette left out. */
test('the trunk is one constant-width block, and every panel across it shares that width', () => {
  assert.ok(TRUNK.width > 0);
  assert.equal(centre(TRUNK), FIGURE_BOX.width / 2);
  assert.equal(TRUNK.top, 40);
  assert.equal(bottom(TRUNK), 96, 'the crotch sits at half the figure, which is where a crotch is');

  const across = REGION_PANELS.filter((panel) => TRUNK_PANELS.includes(panel.region)).flatMap(
    (panel) => panel.shapes.filter((shape) => shape.width > TRUNK.width / 2)
  );
  assert.equal(across.length, TRUNK_PANELS.length, 'every trunk region draws one band across it');
  const widths = new Set(across.map((shape) => shape.width));
  assert.equal(widths.size, 1, `the bands across the trunk are ${[...widths].join(', ')} wide`);
  for (const shape of across) assert.equal(centre(shape), FIGURE_BOX.width / 2);
});

test('the silhouette is mirrored about the midline', () => {
  const centres = GROUND_SHAPES.map(centre);
  for (const at of centres) {
    const mirrored = centres.some((other) => Math.abs(other - (FIGURE_BOX.width - at)) < 0.001);
    assert.ok(mirrored, `a silhouette piece at ${at} has no mirror`);
  }
});

test('a region drawn in more than one place is drawn symmetrically', () => {
  for (const panel of REGION_PANELS) {
    for (const shape of panel.shapes) {
      const on = centre(shape);
      const paired =
        on === FIGURE_BOX.width / 2 ||
        panel.shapes.some((other) => Math.abs(centre(other) - (FIGURE_BOX.width - on)) < 0.001);
      assert.ok(paired, `${panel.region} has a shape at ${on} with no mirror`);
    }
  }
});

/* Tap what you see, in both directions. This is the defect the ticket exists
   to fix: the old HOTSPOTS table put `shoulders` on the left arm and
   `hands_feet` between the ankles, so the figure pointed at one thing and
   answered with another. */
test('every panel is drawn on the part of the body it names', () => {
  for (const panel of REGION_PANELS) {
    for (const shape of panel.shapes) {
      const onIt = GROUND_SHAPES.some((piece) => contains(piece, shape));
      assert.ok(onIt, `${panel.region} draws a shape that is not on the body`);
    }
  }
});

test('every panel sits inside a button that selects it', () => {
  for (const panel of REGION_PANELS) {
    panel.shapes.forEach((shape, i) => {
      assert.ok(
        panel.boxes.some((box) => contains(box, shape)),
        `${panel.region}'s shape ${i} runs outside every button that selects it`
      );
    });
    for (const box of panel.boxes) {
      assert.ok(
        panel.shapes.some((shape) => contains(box, shape)),
        `${panel.region} has a button with nothing drawn under it`
      );
    }
  }
});

/* The seam is what keeps two readings a step apart on the ramp from merging
   across a shared edge, so it has to be a real gap rather than a hairline:
   no two panels of different regions may come closer than twice the inset. */
test('no two regions are drawn closer together than their seam', () => {
  const shapes: { region: string; shape: Shape }[] = REGION_PANELS.flatMap((panel) =>
    panel.shapes.map((shape) => ({ region: panel.region, shape }))
  );
  for (let i = 0; i < shapes.length; i += 1) {
    for (let j = i + 1; j < shapes.length; j += 1) {
      if (shapes[i].region === shapes[j].region) continue;
      assert.ok(
        !overlaps(matShape(shapes[i].shape), matShape(shapes[j].shape)),
        `${shapes[i].region} and ${shapes[j].region} are drawn within a seam of each other`
      );
    }
  }
});

test('a panel keeps its seam inside the figure', () => {
  const box = { left: 0, top: 0, width: FIGURE_BOX.width, height: FIGURE_BOX.height };
  for (const panel of REGION_PANELS) {
    for (const shape of panel.shapes) {
      assert.ok(contains(box, matShape(shape)), `${panel.region}'s seam runs off the figure`);
    }
  }
  assert.ok(SEAM > 0);
});

test('no two buttons overlap, so a tap lands on exactly one region', () => {
  const boxes = hitBoxes();
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      assert.ok(!overlaps(boxes[i].box, boxes[j].box), `${boxes[i].region} and ${boxes[j].region} overlap`);
    }
  }
});

test('every button is inside the figure box', () => {
  const box = { left: 0, top: 0, width: FIGURE_BOX.width, height: FIGURE_BOX.height };
  for (const { region, box: hit } of hitBoxes()) {
    assert.ok(contains(box, hit), `${region}'s button runs off the figure`);
  }
});

/* The bug an earlier review's browser pass found: the module claimed a 320px
   stage and the card's padding rendered it at 314, so every button came out
   47.09px. A floor asserted at a size nothing guarantees is not a floor - so
   the component is handed a minimum stage and this walks every button
   through it. */
test('every button clears 48px at the smallest stage the component allows', () => {
  for (const { region, box } of hitBoxes()) {
    const { w, h } = zonePx(box, MIN_STAGE_WIDTH, MIN_STAGE_HEIGHT);
    assert.ok(w >= TOUCH_PX, `${region}'s button is ${w.toFixed(2)}px wide at the minimum stage`);
    assert.ok(h >= TOUCH_PX, `${region}'s button is ${h.toFixed(2)}px tall at the minimum stage`);
  }
});

test('the minimum stage is derived from the buttons rather than assumed', () => {
  const shortest = Math.min(...hitBoxes().map(({ box }) => box.height));
  assert.equal(MIN_STAGE_HEIGHT, Math.ceil((TOUCH_PX * FIGURE_BOX.height) / shortest));
  // The stage holds its ratio, so a height floor is a width floor as well.
  assert.equal(MIN_STAGE_WIDTH, Math.ceil((MIN_STAGE_HEIGHT * FIGURE_BOX.width) / FIGURE_BOX.height));
});

/* The body is the one region reached by what is left over rather than by a
   box of its own: the panels sit on top of it, so tapping a panel selects
   that panel's region and tapping the limbs, a seam or the space beside the
   figure selects the whole of it. */
test('the body underlies the whole figure', () => {
  assert.equal(GROUND_ZONE.width, FIGURE_BOX.width);
  assert.equal(GROUND_ZONE.height, FIGURE_BOX.height);
});

test('a region with no panel goes to the elsewhere cluster, built-in or not', () => {
  const placement = placeRegions([
    region('chest'),
    region('body_facial_hair'),
    region('whole_body'),
    region('custom-uuid', 'Scars')
  ]);
  assert.deepEqual(placement.drawn.map((d) => d.region.id), ['chest']);
  assert.equal(placement.ground?.id, 'whole_body');
  assert.deepEqual(placement.elsewhere.map((r) => r.id), ['body_facial_hair', 'custom-uuid']);
});

test('a hidden or deleted built-in leaves its place empty rather than shifting the others', () => {
  const placement = placeRegions([region('chest'), region('genitals')]);
  assert.deepEqual(placement.drawn.map((d) => d.panel.region), ['chest', 'genitals']);
  assert.equal(placement.ground, null);
  assert.deepEqual(placement.elsewhere, []);
});

/* Undrawn and zero must not look alike: level 0 is the unfilled panel and
   the ramp starts at 1, the same split the injection map's never-used dot
   makes. */
test('a region with no readings is level 0, and the faintest reading is level 1', () => {
  assert.equal(fillLevel(null), 0);
  assert.equal(fillLevel({ region: 'chest', side: null, value: null, mixed: false, count: 0 }), 0);
  assert.equal(fillLevel({ region: 'chest', side: 'dysphoria', value: 1, mixed: false, count: 1 }), 1);
  assert.equal(fillLevel({ region: 'chest', side: 'euphoria', value: 100, mixed: false, count: 1 }), 4);
});

test('the mixed mark sits on its panel, where the ramp computes an ink for it', () => {
  for (const panel of REGION_PANELS) {
    const shape = markShape(panel.shapes);
    const at = markAt(shape);
    assert.ok(at.x > shape.left, `${panel.region}'s mark is off the leading edge of its panel`);
    assert.ok(at.x < shape.left + shape.width, `${panel.region}'s mark runs past its panel`);
    assert.ok(at.y > shape.top && at.y < shape.top + shape.height, `${panel.region}'s mark is off its panel`);
  }
});

test('a box writes itself as percentages of the figure box', () => {
  const style = boxStyle(hitBoxes()[0].box);
  assert.match(style, /left:\s*\d/);
  assert.match(style, /top:\s*\d/);
  assert.ok(!style.includes('NaN'));
});
