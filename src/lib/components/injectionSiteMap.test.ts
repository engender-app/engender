import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { INJECTION_SITES } from '../data/doseSchedule';
import { spansAt } from './bodySilhouette';
import {
  MAP_DOT_SIZE,
  MAP_HEIGHT,
  MAP_SCALE,
  MAP_TOUCH_GAP,
  MAP_TOUCH_TARGET,
  MAP_VIEW,
  MAP_WIDTH,
  siteCentre,
  sitePoint
} from './injectionSiteMap';

const root = fileURLToPath(new URL('../../..', import.meta.url));

/* The rotation map's geometry (phase 6 ticket 13).

   These coordinates used to live inside InjectionSiteMap.svelte, where
   nothing could check the claim its own comment made - that twelve touch
   targets on a 280px figure stay far enough apart. They did not: two dots
   sat 33.7px apart at 320px, so a fifth of each of six targets belonged to
   a neighbour. Ticket 10 read that crowding as a reason to put recency in a
   text list instead of on the dots, so this is the seam that let the ramp
   onto the map.

   The box got shorter after that. At 280 by 560 the figure was taller than
   the 500px window the sheet scrolls its content in, so no phone showed the
   whole map, let alone the map and the list under it. */
describe('injection site map layout', () => {
  it('keeps every pair of sites a touch target and a gap apart', () => {
    const centres = INJECTION_SITES.map((site) => ({ key: site.key, ...siteCentre(site) }));
    let closest = { gap: Infinity, pair: '' };
    for (const [i, a] of centres.entries()) {
      for (const b of centres.slice(i + 1)) {
        const gap = Math.hypot(a.x - b.x, a.y - b.y);
        if (gap < closest.gap) closest = { gap, pair: `${a.key} and ${b.key}` };
      }
    }
    // Round targets, so centres a target apart are tangent at worst and
    // every dot keeps a tap aimed anywhere inside its own circle. Android
    // asks for 8dp of clear space between two targets on top of that,
    // which is the number here.
    expect(closest.gap, `${closest.pair} are ${closest.gap.toFixed(1)}px apart`).toBeGreaterThanOrEqual(
      MAP_TOUCH_TARGET + MAP_TOUCH_GAP
    );
  });

  it('spaces the dots for the touch target the app actually draws', () => {
    // The layout is spaced in px against a token it cannot read. Raise
    // --touch-target and the spacing above is a claim about a smaller dot
    // than the one on screen, which is why this is asserted rather than
    // trusted.
    const base = readFileSync(root + '/src/lib/theme/base.css', 'utf8');
    const token = /--touch-target:\s*(\d+)px/.exec(base)?.[1];
    expect(token, '--touch-target is not declared in base.css as a whole number of px').toBeDefined();
    expect(Number(token)).toBe(MAP_TOUCH_TARGET);
  });

  it('keeps every touch target inside the figure it is drawn over', () => {
    // A dot half off the box reads as beside the body rather than on it,
    // and the map has no overflow to clip it.
    const half = MAP_TOUCH_TARGET / 2;
    for (const site of INJECTION_SITES) {
      const { x, y } = siteCentre(site);
      expect(x, site.key).toBeGreaterThanOrEqual(half);
      expect(x, site.key).toBeLessThanOrEqual(MAP_WIDTH - half);
      expect(y, site.key).toBeGreaterThanOrEqual(half);
      expect(y, site.key).toBeLessThanOrEqual(MAP_HEIGHT - half);
    }
  });

  it('keeps every dot on the body rather than over the edge of it', () => {
    // Ticket 48: the dots are placed against the shared silhouette now, and
    // a dot that straddles a contour reads as a mistake wherever it is. The
    // visible dot, not the touch target, is what has to be inside - the
    // target is invisible and is allowed to hang over an arm.
    // The whole disc, not its centre: the shoulder and the flank both run
    // away from a dot faster than its own rim, so a centre comfortably
    // inside the body can still be a dot with a bite out of it - which is
    // what the deltoid dot had at the first placement.
    const radius = MAP_DOT_SIZE / 2 / MAP_SCALE;
    const spanAround = (x: number, y: number) => spansAt(y).find(([left, right]) => x >= left && x <= right);
    for (const site of INJECTION_SITES) {
      const { x, y } = sitePoint(site);
      const home = spansAt(y).find(([left, right]) => x - radius >= left && x + radius <= right);
      expect(home, `${site.key} at (${x}, ${y}) is not wholly inside one part of the body`).toBeDefined();
      for (let i = 0; i < 24; i += 1) {
        const angle = (i / 24) * 2 * Math.PI;
        const rimX = x + radius * Math.cos(angle);
        const rimY = y + radius * Math.sin(angle);
        const on = spanAround(rimX, rimY);
        const same = on && home && on[1] >= home[0] && on[0] <= home[1];
        expect(same, `${site.key} has its rim off the body at (${rimX.toFixed(1)}, ${rimY.toFixed(1)})`).toBe(true);
      }
    }
  });

  it('draws the whole of the figure it frames', () => {
    // The map shows the top of the silhouette rather than all of it (see
    // MAP_VIEW), so the frame has to end below the lowest dot by enough to
    // hold that dot's own touch target - a target clipped by the foot of
    // the box is the same defect as one hanging off the side.
    const lowest = Math.max(...INJECTION_SITES.map((site) => siteCentre(site).y));
    expect(MAP_HEIGHT - lowest).toBeGreaterThanOrEqual(MAP_TOUCH_TARGET / 2);
    expect(MAP_VIEW.height * MAP_SCALE).toBe(MAP_HEIGHT);
    expect(MAP_VIEW.width * MAP_SCALE).toBe(MAP_WIDTH);
  });

  it('draws no body of its own', () => {
    // Acceptance line one, as a claim a test can hold: the only body in the
    // app is bodySilhouette.ts, so the map's own SVG may carry the shared
    // path and nothing else that draws.
    const source = readFileSync(root + '/src/lib/components/InjectionSiteMap.svelte', 'utf8');
    const svg = /<svg[\s\S]*?<\/svg>/.exec(source)?.[0];
    expect(svg, 'InjectionSiteMap.svelte draws no SVG at all').toBeDefined();
    expect(svg).toContain('SILHOUETTE_PATH');
    for (const shape of ['<circle', '<rect', '<ellipse', '<polygon', '<polyline', '<line']) {
      expect(svg, `the map draws its own ${shape}`).not.toContain(shape);
    }
  });

  it('mirrors the two sides of a region around the midline', () => {
    for (const site of INJECTION_SITES.filter((s) => s.side === 'left')) {
      const right = INJECTION_SITES.find((s) => s.region === site.region && s.side === 'right')!;
      expect(siteCentre(site).y).toBe(siteCentre(right).y);
      expect(siteCentre(site).x + siteCentre(right).x).toBe(MAP_WIDTH);
    }
  });
});
