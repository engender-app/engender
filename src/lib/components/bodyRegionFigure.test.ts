/* The figure's arrangement (phase 10 redesign ticket 40). The rules that
   have to hold are about coverage and about neutrality, and both are
   checkable without drawing anything. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  FIGURE_BOX,
  FIGURE_SLOTS,
  GROUND_REGION,
  GROUND_SLOT,
  MIN_SLOT_UNITS,
  STAGE_HEIGHT,
  fillLevel,
  placeRegions,
  slotStyle
} from './bodyRegionFigure.ts';
import { BUILT_IN_BODY_REGIONS } from '../data/vocabulary/builtins.ts';

const region = (id: string, name = id) => ({ id, name, builtIn: true, hidden: false });

test('every built-in region is either a slot on the figure or its ground', () => {
  const placed = new Set([...FIGURE_SLOTS.map((slot) => slot.region), GROUND_REGION]);
  for (const key of BUILT_IN_BODY_REGIONS) {
    if (key === 'body_facial_hair') continue; // deliberately in the elsewhere cluster
    assert.ok(placed.has(key), `${key} has no place on the figure`);
  }
  assert.equal(FIGURE_SLOTS.length, 8);
  assert.equal(GROUND_REGION, 'whole_body');
});

test('the slots run down the body, which is the order they arrive in', () => {
  assert.deepEqual(
    FIGURE_SLOTS.map((slot) => slot.region),
    ['hairline', 'face_jaw', 'voice_throat', 'shoulders', 'chest', 'hips_waist', 'genitals', 'hands_feet']
  );
  const tops = FIGURE_SLOTS.map((slot) => slot.top);
  assert.deepEqual([...tops].sort((a, b) => a - b), tops);
});

/* Neutral by construction rather than by careful drawing: every shape is
   centred on the figure's midline, so there is no contour to carry a waist,
   a bust or a set of hips. This is the check that a later tweak to one
   shape's width cannot quietly break. */
test('every slot is centred on the midline and sits inside the ground', () => {
  for (const slot of FIGURE_SLOTS) {
    const centre = slot.left + slot.width / 2;
    assert.equal(centre, FIGURE_BOX.width / 2, `${slot.region} is off the midline`);
    assert.ok(slot.left >= 0 && slot.left + slot.width <= FIGURE_BOX.width, `${slot.region} is off the box`);
    assert.ok(slot.top >= 0 && slot.top + slot.height <= FIGURE_BOX.height, `${slot.region} is off the box`);
  }
});

test('the shapes do not overlap, so a tap lands on exactly one region', () => {
  for (let i = 1; i < FIGURE_SLOTS.length; i += 1) {
    const above = FIGURE_SLOTS[i - 1];
    const below = FIGURE_SLOTS[i];
    assert.ok(
      above.top + above.height <= below.top,
      `${above.region} and ${below.region} overlap`
    );
  }
});

test('a region with no slot goes to the elsewhere cluster, built-in or not', () => {
  const placement = placeRegions([
    region('chest'),
    region('body_facial_hair'),
    region('whole_body'),
    region('custom-uuid', 'Scars')
  ]);

  assert.deepEqual(placement.slots.map((s) => s.region.id), ['chest']);
  assert.equal(placement.ground?.id, 'whole_body');
  assert.deepEqual(placement.elsewhere.map((r) => r.id), ['body_facial_hair', 'custom-uuid']);
});

test('a hidden or deleted built-in leaves its slot empty rather than shifting the others', () => {
  const placement = placeRegions([region('chest'), region('genitals')]);
  assert.deepEqual(placement.slots.map((s) => s.region.id), ['chest', 'genitals']);
  assert.deepEqual(placement.slots.map((s) => s.slot.region), ['chest', 'genitals']);
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

test('a slot writes itself as percentages of the figure box', () => {
  const style = slotStyle(FIGURE_SLOTS[0]);
  assert.match(style, /left:\s*\d/);
  assert.match(style, /top:\s*\d/);
  assert.match(style, /width:\s*\d/);
  assert.match(style, /height:\s*\d/);
  assert.ok(!style.includes('NaN'));
});

/* A shape is its own hit target now, so the drawing carries the 48px floor
   rather than an invisible button around a 14px dot. */
test('no shape is drawn shorter than the touch target', () => {
  for (const slot of [...FIGURE_SLOTS, GROUND_SLOT]) {
    assert.ok(
      slot.height >= MIN_SLOT_UNITS,
      `${slot.region} is ${(slot.height * STAGE_HEIGHT) / FIGURE_BOX.height}px tall, under 48`
    );
  }
});
