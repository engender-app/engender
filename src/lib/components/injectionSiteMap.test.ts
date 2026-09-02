import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { INJECTION_SITES } from '../data/doseSchedule';
import { MAP_TOUCH_GAP, MAP_TOUCH_TARGET, MAP_WIDTH, siteCentre } from './injectionSiteMap';

const root = fileURLToPath(new URL('../../..', import.meta.url));

/* The rotation map's geometry (phase 6 ticket 13).

   These coordinates used to live inside InjectionSiteMap.svelte, where
   nothing could check the claim its own comment made - that twelve touch
   targets on a 280px figure stay far enough apart. They did not: two dots
   sat 33.7px apart at 320px, so a fifth of each of six targets belonged to
   a neighbour. Ticket 10 read that crowding as a reason to put recency in a
   text list instead of on the dots, so this is the seam that let the ramp
   onto the map. */
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
      expect(y, site.key).toBeLessThanOrEqual(MAP_WIDTH * 2 - half);
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
