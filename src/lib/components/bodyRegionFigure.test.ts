/* The figure's geometry (phase 10 redesign ticket 40, recast for phase 11
   ticket 47). Four properties, each of them something a <style> block
   cannot be asked about and a render will not reliably show: a tap lands on
   exactly one region, every button clears the touch floor at the smallest
   stage the component allows, every panel is a piece of the body it names,
   and the panels tile that body without a gap.

   What moved out: neutrality. It used to live here because a panel was a
   rectangle of its own and one drawn wider than its neighbour would have
   put a bust back on a flat silhouette. A panel is now a band of the shared
   path clipped to it, so it is exactly as wide as the body and cannot
   disagree with it - the three measurements are in
   `bodySilhouette.test.ts` (ADR-0087). */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  FIGURE_BOX,
  GROUND_REGION,
  GROUND_ZONE,
  MARK,
  MIN_STAGE_HEIGHT,
  MIN_STAGE_WIDTH,
  REGION_PANELS,
  TOUCH_PX,
  bandBox,
  boxStyle,
  contains,
  fillLevel,
  hitBoxes,
  markAt,
  markBand,
  markFit,
  overlaps,
  placeRegions,
  zonePx
} from './bodyRegionFigure.ts';
import type { Box } from './bodyRegionFigure.ts';
import { CANON, MIDLINE, spansAt } from './bodySilhouette.ts';
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
  const tops = REGION_PANELS.map((p) => p.bands[0].top);
  assert.deepEqual([...tops].sort((a, b) => a - b), tops);
});

/* The body stays one unbroken object, which is the half of ticket 47 that
   is about the seams rather than about the contour: the bands down the
   middle column are flush, so no height between the crown and the crotch is
   outside a band and none is inside two. Four bare white boxes stacked on a
   grey body was the look this replaces, and a gap of card colour between
   them was half of it. */
test('the bands down the middle of the body tile it from the crown to the crotch', () => {
  const column = REGION_PANELS.flatMap((panel) =>
    panel.bands.filter((area) => centre(area) === MIDLINE && area.top < CANON.crotch)
  ).sort((a, b) => a.top - b.top);

  assert.equal(column[0].top, CANON.crown);
  assert.equal(bottom(column[column.length - 1]), CANON.crotch);
  for (let i = 1; i < column.length; i += 1) {
    assert.equal(column[i].top, bottom(column[i - 1]), `a gap or an overlap at y=${column[i].top}`);
    assert.equal(column[i].left, column[0].left, 'the column changes width partway down');
    assert.equal(column[i].width, column[0].width);
  }
});

test('a region drawn in more than one place is drawn symmetrically', () => {
  for (const panel of REGION_PANELS) {
    for (const area of panel.bands) {
      const on = centre(area);
      const paired =
        on === MIDLINE ||
        panel.bands.some(
          (other) =>
            Math.abs(centre(other) - (FIGURE_BOX.width - on)) < 0.001 &&
            other.top === area.top &&
            other.height === area.height
        );
      assert.ok(paired, `${panel.region} has a band at ${on} with no mirror`);
    }
  }
});

/* Tap what you see, in both directions. This is the defect ticket 40 existed
   to fix - the old HOTSPOTS table put `shoulders` on the left arm and
   `hands_feet` between the ankles - and a band that clips to nothing is the
   way it would come back: a button over a part of the figure with no body
   under it answers for a region a person cannot see. */
test('every band draws a piece of the body', () => {
  for (const panel of REGION_PANELS) {
    panel.bands.forEach((area, i) => {
      const drawn = bandBox(area);
      assert.ok(drawn.width > 2, `${panel.region}'s band ${i} draws ${drawn.width.toFixed(2)} units of body`);
      assert.ok(drawn.height > 2, `${panel.region}'s band ${i} draws ${drawn.height.toFixed(2)} units tall`);
    });
  }
});

test('every band sits inside a button that selects it', () => {
  for (const panel of REGION_PANELS) {
    assert.equal(panel.bands.length, panel.boxes.length, `${panel.region} has a band with no button`);
    panel.bands.forEach((area, i) => {
      const drawn = bandBox(area);
      assert.ok(
        panel.boxes.some((box) => contains(box, drawn)),
        `${panel.region}'s band ${i} draws outside every button that selects it`
      );
    });
  }
});

/* A band of the torso may not pick up a piece of an arm, or the chest would
   paint a shoulder. With the arms hanging clear of the torso below the
   armpit, one band of the middle column crosses exactly one piece of body
   at every height - which is a claim about the drawing and the window
   together, so it is checked against the path rather than against the
   numbers either side of it. */
test('a band of the middle column holds one piece of body at every height', () => {
  const column = REGION_PANELS.flatMap((panel) => panel.bands).filter(
    (area) => centre(area) === MIDLINE
  );
  for (const area of column) {
    for (let y = area.top; y <= bottom(area); y += 0.25) {
      const runs = spansAt(y)
        .map(([a, b]): [number, number] => [
          Math.max(a, area.left),
          Math.min(b, area.left + area.width)
        ])
        .filter(([a, b]) => b - a > 0.01);
      assert.ok(runs.length <= 1, `the band at y=${area.top} holds ${runs.length} pieces at y=${y}`);
    }
  }
});

/* A band's hairline is the band's own outline, so a side edge that grazes
   the body draws a straight line down the side of it and the picked panel
   reads as a rectangle over a torso rather than as a piece of one. Every
   side edge has to be somewhere the body is not - except at the shoulder,
   where the arm and the torso divide one mass between them and that line is
   the seam the figure wants. */
test('a band\'s side edge is clear of the body, except at the shoulder seam', () => {
  const line = 0.4; // half of rule 9's 2px at the widest stage, in units
  for (const panel of REGION_PANELS) {
    for (const area of panel.bands) {
      for (const x of [area.left, area.left + area.width]) {
        if (x <= 0 || x >= FIGURE_BOX.width) continue;
        for (let y = area.top; y <= bottom(area); y += 0.25) {
          const near = spansAt(y).some(([a, b]) => a - line < x && x < b + line);
          if (!near) continue;
          assert.ok(
            y >= CANON.collar && y <= 48,
            `${panel.region}'s edge at x=${x} grazes the body at y=${y.toFixed(2)}`
          );
        }
      }
    }
  }
});

/* Two regions may share an edge - the bands are flush on purpose - but not
   an area, or one panel's fill would paint over another's. */
test('no two regions draw over one another', () => {
  const all = REGION_PANELS.flatMap((panel) => panel.bands.map((area) => ({ panel, area })));
  for (let i = 0; i < all.length; i += 1) {
    for (let j = i + 1; j < all.length; j += 1) {
      if (all[i].panel.region === all[j].panel.region) continue;
      assert.ok(
        !overlaps(all[i].area, all[j].area),
        `${all[i].panel.region} and ${all[j].panel.region} overlap`
      );
    }
  }
});

test('no two buttons overlap, so a tap lands on exactly one region', () => {
  const zones = hitBoxes();
  for (let i = 0; i < zones.length; i += 1) {
    for (let j = i + 1; j < zones.length; j += 1) {
      assert.ok(!overlaps(zones[i].box, zones[j].box), `${zones[i].region} and ${zones[j].region} overlap`);
    }
  }
});

test('every button is inside the figure box', () => {
  const box = { left: 0, top: 0, width: FIGURE_BOX.width, height: FIGURE_BOX.height };
  for (const { region: name, box: hit } of hitBoxes()) {
    assert.ok(contains(box, hit), `${name}'s button runs off the figure`);
  }
});

/* The bug an earlier review's browser pass found: the module claimed a 320px
   stage and the card's padding rendered it at 314, so every button came out
   47.09px. A floor asserted at a size nothing guarantees is not a floor - so
   the component is handed a minimum stage and this walks every button
   through it. */
test('every button clears 48px at the smallest stage the component allows', () => {
  for (const { region: name, box } of hitBoxes()) {
    const { w, h } = zonePx(box, MIN_STAGE_WIDTH, MIN_STAGE_HEIGHT);
    assert.ok(w >= TOUCH_PX, `${name}'s button is ${w.toFixed(2)}px wide at the minimum stage`);
    assert.ok(h >= TOUCH_PX, `${name}'s button is ${h.toFixed(2)}px tall at the minimum stage`);
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
   that panel's region and tapping the limbs, the legs or the space beside
   the figure selects the whole of it. */
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

/* Undrawn and zero must not look alike: level 0 is the silhouette's own
   neutral fill and the ramp starts at 1, the same split the injection map's
   never-used dot makes. */
test('a region with no readings is level 0, and the faintest reading is level 1', () => {
  assert.equal(fillLevel(null), 0);
  assert.equal(fillLevel({ region: 'chest', side: null, value: null, mixed: false, count: 0, sideCount: 0 }), 0);
  assert.equal(fillLevel({ region: 'chest', side: 'dysphoria', value: 1, mixed: false, count: 1, sideCount: 1 }), 1);
  assert.equal(fillLevel({ region: 'chest', side: 'euphoria', value: 100, mixed: false, count: 1, sideCount: 1 }), 4);
});

/* The mark has to sit on body rather than half off it, which a centroid
   alone does not guarantee: `hands_feet`'s largest band runs from above the
   ankle to the sole, and its centroid is the narrowest part of it. */
test('the mixed mark fits on the band it marks, with its ink read off that fill', () => {
  for (const panel of REGION_PANELS) {
    const area = markBand(panel.bands);
    const fit = markFit(area);
    assert.ok(
      fit >= MARK.width + 0.5,
      `${panel.region}'s mark is ${MARK.width} wide where the body is ${fit.toFixed(2)}`
    );
    const at = markAt(area);
    const drawn = bandBox(area);
    assert.ok(at.x > drawn.left && at.x + MARK.width < drawn.left + drawn.width, `${panel.region}'s mark runs off its band`);
    assert.ok(at.y > drawn.top && at.y + MARK.height * 2 + MARK.gap < drawn.top + drawn.height, `${panel.region}'s mark runs past its band`);
  }
});

test('a box writes itself as percentages of the figure box', () => {
  const style = boxStyle(hitBoxes()[0].box);
  assert.match(style, /left:\s*\d/);
  assert.match(style, /top:\s*\d/);
  assert.ok(!style.includes('NaN'));
});
