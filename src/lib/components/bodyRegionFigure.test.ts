/* The figure's geometry (phase 10 redesign ticket 40). Three properties,
   and each of them is something a <style> block cannot be asked about and a
   render will not reliably show: a tap lands on exactly one region, every
   target clears the touch floor at the smallest stage the component allows,
   and what is drawn is inside the zone that selects it. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  FIGURE_BOX,
  GROUND_REGION,
  GROUND_SHAPES,
  GROUND_ZONES,
  MIN_STAGE_HEIGHT,
  MIN_STAGE_WIDTH,
  PELVIS,
  REGION_DRAWINGS,
  TORSO,
  TOUCH_PX,
  boxStyle,
  contains,
  fillLevel,
  markAt,
  overlaps,
  placeRegions,
  zonePx
} from './bodyRegionFigure.ts';
import { BUILT_IN_BODY_REGIONS } from '../data/vocabulary/builtins.ts';

const region = (id: string, name = id) => ({ id, name, builtIn: true, hidden: false });
const everyZone = [...REGION_DRAWINGS.flatMap((d) => d.zones), ...GROUND_ZONES];

test('every built-in region is either drawn on the figure or is its ground', () => {
  const placed = new Set([...REGION_DRAWINGS.map((d) => d.region), GROUND_REGION]);
  for (const key of BUILT_IN_BODY_REGIONS) {
    if (key === 'body_facial_hair') continue; // deliberately in the elsewhere cluster
    assert.ok(placed.has(key), `${key} has no place on the figure`);
  }
  assert.equal(REGION_DRAWINGS.length, 8);
});

test('the regions run down the body, which is the order they arrive in', () => {
  assert.deepEqual(
    REGION_DRAWINGS.map((d) => d.region),
    ['hairline', 'face_jaw', 'voice_throat', 'shoulders', 'chest', 'hips_waist', 'genitals', 'hands_feet']
  );
});

/* The neutrality rule, in the one place it lives.

   A contour is allowed - the figure is a wooden artist's mannequin, which
   is a body everybody reads as a body and nobody reads as a particular one.
   What is not allowed is a trunk that pulls in at a waist, swells at a bust
   or flares at a hip, because those are the three that say which body this
   is, and they are exactly the three regions the ticket names as costing
   most to get wrong. Two rects of one width each is what guarantees it. */
test('the trunk is two constant-width blocks, which is what makes the figure neutral', () => {
  for (const block of [TORSO, PELVIS]) {
    // One width: a rect cannot taper, so no waist, no bust and no hip flare.
    assert.ok(block.width > 0);
    // Mirrored about the midline, so it cannot lean either.
    assert.equal(block.left + block.width / 2, FIGURE_BOX.width / 2);
  }
  assert.ok(TORSO.width > PELVIS.width, 'a ribcage is wider than a pelvis on a mannequin');

  // And every piece of the connective mannequin is centred or mirrored too.
  const centres = GROUND_SHAPES.map((s) => s.left + s.width / 2);
  for (const centre of centres) {
    const mirrored = centres.some((other) => Math.abs(other - (FIGURE_BOX.width - centre)) < 0.001);
    assert.ok(mirrored, `a silhouette piece at ${centre} has no mirror`);
  }
});

/* Every region drawn on the trunk is mirrored too, so a shape cannot say
   something about one side of a body that it does not say about the other. */
test('every drawn region is mirrored about the midline', () => {
  for (const drawing of REGION_DRAWINGS) {
    const centres = drawing.shapes.map((s) => s.left + s.width / 2);
    for (const centre of centres) {
      const mirrored = centres.some((other) => Math.abs(other - (FIGURE_BOX.width - centre)) < 0.001);
      assert.ok(mirrored, `${drawing.region} has a shape at ${centre} with no mirror`);
    }
  }
});

test('no two zones overlap, so a tap lands on exactly one region', () => {
  for (let i = 0; i < everyZone.length; i += 1) {
    for (let j = i + 1; j < everyZone.length; j += 1) {
      assert.ok(!overlaps(everyZone[i], everyZone[j]), `zones ${i} and ${j} overlap`);
    }
  }
});

test('every zone is inside the figure box', () => {
  const box = { left: 0, top: 0, width: FIGURE_BOX.width, height: FIGURE_BOX.height };
  for (const zone of everyZone) assert.ok(contains(box, zone), 'a zone runs off the figure');
});

/* The bug the review's browser pass found: the module claimed a 320px stage
   and the card's padding rendered it at 314, so every button came out
   47.09px. A floor that is asserted at a size nothing guarantees is not a
   floor - so the component is handed a minimum stage and this walks every
   zone through it. */
test('every zone clears 48px at the smallest stage the component allows', () => {
  for (const zone of everyZone) {
    const { w, h } = zonePx(zone, MIN_STAGE_WIDTH, MIN_STAGE_HEIGHT);
    assert.ok(w >= TOUCH_PX, `a zone is ${w.toFixed(2)}px wide at the minimum stage`);
    assert.ok(h >= TOUCH_PX, `a zone is ${h.toFixed(2)}px tall at the minimum stage`);
  }
});

test('the minimum stage is derived from the zones rather than assumed', () => {
  const narrowest = Math.min(...everyZone.map((z) => z.width));
  const shortest = Math.min(...everyZone.map((z) => z.height));
  assert.equal(MIN_STAGE_WIDTH, Math.ceil((TOUCH_PX * FIGURE_BOX.width) / narrowest));
  assert.equal(MIN_STAGE_HEIGHT, Math.ceil((TOUCH_PX * FIGURE_BOX.height) / shortest));
});

/* Tap what you see. Every shape a person can make out has to sit inside one
   of its own region's zones, or the figure draws one thing and selects
   another - which is precisely what the old HOTSPOTS table did, with a dot
   for the shoulders floating over the left arm. */
test('every drawn shape sits inside a zone that selects its own region', () => {
  for (const drawing of REGION_DRAWINGS) {
    for (const shape of drawing.shapes) {
      const home = drawing.zones.some((zone) => contains(zone, shape));
      assert.ok(home, `${drawing.region} draws a shape outside its own zones`);
    }
  }
});

/* The ground is the exception, and it has to be stated rather than assumed:
   its drawing is the silhouette, which runs under the eight, so it is
   reached where they are not. */
test('the ground is reached beside the figure rather than on it', () => {
  assert.ok(GROUND_ZONES.length > 0);
  for (const zone of GROUND_ZONES) {
    const onTheEight = REGION_DRAWINGS.some((d) => d.zones.some((other) => overlaps(zone, other)));
    assert.ok(!onTheEight, 'a ground zone sits on one of the eight');
  }
});

test('a region with no place on the figure goes to the elsewhere cluster, built-in or not', () => {
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
  assert.deepEqual(placement.drawn.map((d) => d.drawing.region), ['chest', 'genitals']);
  assert.equal(placement.ground, null);
  assert.deepEqual(placement.elsewhere, []);
});

/* Undrawn and zero must not look alike: level 0 is the empty shape and the
   ramp starts at 1, the same split the injection map's never-used dot
   makes. */
test('a region with no readings is level 0, and the faintest reading is level 1', () => {
  assert.equal(fillLevel(null), 0);
  assert.equal(fillLevel({ region: 'chest', side: null, value: null, mixed: false, count: 0 }), 0);
  assert.equal(fillLevel({ region: 'chest', side: 'dysphoria', value: 1, mixed: false, count: 1 }), 1);
  assert.equal(fillLevel({ region: 'chest', side: 'euphoria', value: 100, mixed: false, count: 1 }), 4);
});

test('the mixed mark lands inside the shape it marks', () => {
  for (const drawing of REGION_DRAWINGS) {
    const at = markAt(drawing);
    const home = drawing.shapes.some(
      (s) => at.x >= s.left && at.x <= s.left + s.width && at.y >= s.top && at.y <= s.top + s.height
    );
    assert.ok(home, `${drawing.region}'s mixed mark falls outside its shapes`);
  }
});

test('a box writes itself as percentages of the figure box', () => {
  const style = boxStyle(REGION_DRAWINGS[0].zones[0]);
  assert.match(style, /left:\s*\d/);
  assert.match(style, /top:\s*\d/);
  assert.ok(!style.includes('NaN'));
});
