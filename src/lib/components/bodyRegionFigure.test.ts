/* The figure's geometry (phase 10 redesign ticket 40). Three properties,
   each of them something a <style> block cannot be asked about and a render
   will not reliably show: a tap lands on exactly one region, every button
   clears the touch floor at the smallest stage the component allows, and
   every point sits on the part of the body it names. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  FIGURE_BOX,
  GROUND_REGION,
  GROUND_SHAPES,
  GROUND_ZONE,
  HIT_HEIGHT,
  HIT_WIDTH,
  MIN_STAGE_HEIGHT,
  MIN_STAGE_WIDTH,
  PELVIS,
  POINT_GAP,
  POINT_HOME,
  REGION_POINTS,
  TORSO,
  TOUCH_PX,
  boxStyle,
  contains,
  fillLevel,
  hitBoxes,
  markAt,
  overlaps,
  placeRegions,
  zonePx
} from './bodyRegionFigure.ts';
import { BUILT_IN_BODY_REGIONS } from '../data/vocabulary/builtins.ts';

const region = (id: string, name = id) => ({ id, name, builtIn: true, hidden: false });

test('every built-in region is either a point on the figure or its body', () => {
  const placed = new Set([...REGION_POINTS.map((p) => p.region), GROUND_REGION]);
  for (const key of BUILT_IN_BODY_REGIONS) {
    if (key === 'body_facial_hair') continue; // deliberately in the elsewhere cluster
    assert.ok(placed.has(key), `${key} has no place on the figure`);
  }
  assert.equal(REGION_POINTS.length, 8);
});

test('the points run down the body, which is the order they arrive in', () => {
  assert.deepEqual(
    REGION_POINTS.map((p) => p.region),
    ['hairline', 'face_jaw', 'voice_throat', 'shoulders', 'chest', 'hips_waist', 'genitals', 'hands_feet']
  );
  const tops = REGION_POINTS.map((p) => p.points[0].y);
  assert.deepEqual([...tops].sort((a, b) => a - b), tops);
});

/* The neutrality rule, in the one place it lives.

   A contour is allowed - the figure is a body, and Alicja's own statement of
   the rule is that the outline has to be neutral rather than absent. What is
   not allowed is a trunk that pulls in at a waist, swells at a bust or
   flares at a hip, because those are the three that say which body this is,
   and they are exactly the three regions the ticket names as costing most to
   get wrong. Two rects of one width each is what guarantees the first two;
   the third needs saying separately, because the drawing this figure came
   from had its pelvis 2 units wider than its torso. */
test('the trunk is two constant-width blocks, which is what makes the figure neutral', () => {
  for (const block of [TORSO, PELVIS]) {
    assert.ok(block.width > 0);
    assert.equal(block.left + block.width / 2, FIGURE_BOX.width / 2);
  }
  assert.ok(PELVIS.width <= TORSO.width, 'the pelvis may never be the wider of the two');

  const centres = GROUND_SHAPES.map((s) => s.left + s.width / 2);
  for (const centre of centres) {
    const mirrored = centres.some((other) => Math.abs(other - (FIGURE_BOX.width - centre)) < 0.001);
    assert.ok(mirrored, `a silhouette piece at ${centre} has no mirror`);
  }
});

/* A region's dots sit on the midline, or come as a mirrored pair - so no
   region's marks favour one side of a body over the other. */
test('every point is centred or mirrored', () => {
  for (const point of REGION_POINTS) {
    for (const at of point.points) {
      const centred = at.x === FIGURE_BOX.width / 2;
      const mirrored = point.points.some((other) => Math.abs(other.x - (FIGURE_BOX.width - at.x)) < 0.001);
      assert.ok(centred || mirrored, `${point.region} has a dot at ${at.x} with no mirror`);
    }
  }
});

/* Tap what you see. This is the defect the ticket exists to fix: the old
   HOTSPOTS table put `shoulders` on the left arm and `hands_feet` between
   the ankles, so the figure pointed at one thing and answered with another.
   Checking each point against the piece of the silhouette it belongs to is
   what stops a coordinate drifting off its own body part unnoticed. */
test('every point lands on the part of the body it names', () => {
  for (const point of REGION_POINTS) {
    const homes = POINT_HOME[point.region];
    assert.ok(homes?.length, `${point.region} names no part of the body`);
    for (const at of point.points) {
      const onIt = homes.some((i) => {
        const piece = GROUND_SHAPES[i];
        return (
          at.x >= piece.left &&
          at.x <= piece.left + piece.width &&
          at.y >= piece.top &&
          at.y <= piece.top + piece.height
        );
      });
      assert.ok(onIt, `${point.region} has a dot that is not on the body part it belongs to`);
    }
  }
});

test('no two buttons overlap, so a tap lands on exactly one region', () => {
  const boxes = hitBoxes();
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      assert.ok(!overlaps(boxes[i].box, boxes[j].box), `${boxes[i].region} and ${boxes[j].region} overlap`);
    }
  }
});

test('the points are never closer than a touch target', () => {
  for (let i = 1; i < REGION_POINTS.length; i += 1) {
    const gap = REGION_POINTS[i].points[0].y - REGION_POINTS[i - 1].points[0].y;
    assert.ok(gap >= POINT_GAP, `${REGION_POINTS[i].region} sits ${gap} units below its neighbour`);
  }
  assert.equal(POINT_GAP, HIT_HEIGHT);
});

test('every button is inside the figure box', () => {
  const box = { left: 0, top: 0, width: FIGURE_BOX.width, height: FIGURE_BOX.height };
  for (const { region, box: hit } of hitBoxes()) {
    assert.ok(contains(box, hit), `${region}'s button runs off the figure`);
  }
});

/* The bug the review's browser pass found on the version before this one:
   the module claimed a 320px stage and the card's padding rendered it at
   314, so every button came out 47.09px. A floor asserted at a size nothing
   guarantees is not a floor - so the component is handed a minimum stage and
   this walks every button through it. */
test('every button clears 48px at the smallest stage the component allows', () => {
  for (const { region, box } of hitBoxes()) {
    const { w, h } = zonePx(box, MIN_STAGE_WIDTH, MIN_STAGE_HEIGHT);
    assert.ok(w >= TOUCH_PX, `${region}'s button is ${w.toFixed(2)}px wide at the minimum stage`);
    assert.ok(h >= TOUCH_PX, `${region}'s button is ${h.toFixed(2)}px tall at the minimum stage`);
  }
});

test('the minimum stage is derived from the button rather than assumed', () => {
  // Halved, because hands_feet's pair share one button's width between them.
  assert.equal(MIN_STAGE_WIDTH, Math.ceil((TOUCH_PX * FIGURE_BOX.width) / (HIT_WIDTH / 2)));
  assert.equal(MIN_STAGE_HEIGHT, Math.ceil((TOUCH_PX * FIGURE_BOX.height) / HIT_HEIGHT));
});

/* The body is the one region reached by what is left over rather than by a
   box of its own: the points sit on top of it, so tapping one selects that
   point's region and tapping anywhere else on the body selects the whole of
   it. */
test('the body underlies the whole figure', () => {
  assert.equal(GROUND_ZONE.width, FIGURE_BOX.width);
  assert.equal(GROUND_ZONE.height, FIGURE_BOX.height);
});

test('a region with no point goes to the elsewhere cluster, built-in or not', () => {
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
  assert.deepEqual(placement.drawn.map((d) => d.point.region), ['chest', 'genitals']);
  assert.equal(placement.ground, null);
  assert.deepEqual(placement.elsewhere, []);
});

/* Undrawn and zero must not look alike: level 0 is the empty dot and the
   ramp starts at 1, the same split the injection map's never-used dot
   makes. */
test('a region with no readings is level 0, and the faintest reading is level 1', () => {
  assert.equal(fillLevel(null), 0);
  assert.equal(fillLevel({ region: 'chest', side: null, value: null, mixed: false, count: 0 }), 0);
  assert.equal(fillLevel({ region: 'chest', side: 'dysphoria', value: 1, mixed: false, count: 1 }), 1);
  assert.equal(fillLevel({ region: 'chest', side: 'euphoria', value: 100, mixed: false, count: 1 }), 4);
});

test('the mixed mark sits beside its dot rather than on it', () => {
  for (const point of REGION_POINTS) {
    const at = markAt(point.points[0]);
    assert.ok(at.x > point.points[0].x, `${point.region}'s mark is not clear of its dot`);
    assert.ok(at.x < FIGURE_BOX.width && at.y > 0, `${point.region}'s mark is off the figure`);
  }
});

test('a box writes itself as percentages of the figure box', () => {
  const style = boxStyle(hitBoxes()[0].box);
  assert.match(style, /left:\s*\d/);
  assert.match(style, /top:\s*\d/);
  assert.ok(!style.includes('NaN'));
});
