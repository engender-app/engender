/* What this file is for: the ways down from Safe space are an order
   somebody argued for, and an order is the one thing a screenshot of the
   screen cannot prove stayed put. Ticket 47's acceptance asks for the
   surfaces to be reachable "in a stated order", so the order is stated here
   and read back.

   The route check is the other half: a way that points at a route nobody
   built is a tap into a 404, and on this screen that lands on a person
   having a bad day.

   The third check: a way must land on the screen itself and not on a
   redirect to it. A bookmark taking a hop and the crisis screen's own row
   taking one are different things.

   Functional audit ticket 09 took two rows away: the letters and the Look
   back reading. Each one switched the lit tab mid-crisis, landing a person
   on another door's screen. Safe space keeps breathing, good moments, the
   comfort list (the button above the breath) and the resources, and the
   list says so. */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SAFE_SPACE_WAYS } from './safeSpaceWays.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));

/** A way's href without the fragment a row may carry (ticket 15). */
const routeOf = (href: string) => href.split('#')[0];

describe('the ways down from Safe space', () => {
  it('holds the resources and good moments, and nothing else', () => {
    expect(SAFE_SPACE_WAYS.map((w) => w.key)).toEqual(['resources', 'evidence']);
  });

  it('never leaves Safe space for another door', () => {
    /* FA 09: the letters row lit the Transition tab and the readings row
       lit Look back. Every way down stays under /doubt or on the resource
       directory, which Safe space already shares with the More hub. */
    for (const way of SAFE_SPACE_WAYS) {
      expect(way.href === '/support/resources' || way.href.startsWith('/doubt/'), `${way.key} -> ${way.href}`).toBe(true);
    }
  });

  it('names each way once', () => {
    const keys = SAFE_SPACE_WAYS.map((w) => w.key);
    expect(new Set(keys).size).toBe(keys.length);
    const hrefs = SAFE_SPACE_WAYS.map((w) => w.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('points good moments at its own screen and the resources at the directory', () => {
    /* The comfort list is the button above the breath, not a way down
       (phase 14 ticket 18): safe-space-surfaces.test.ts holds it. */
    expect(SAFE_SPACE_WAYS.find((w) => w.key === 'evidence')?.href).toBe('/doubt/evidence');
    expect(SAFE_SPACE_WAYS.find((w) => w.key === 'resources')?.href).toBe('/support/resources');
  });

  it('points every way at a route that exists', () => {
    for (const way of SAFE_SPACE_WAYS) {
      const page = `${root}src/routes${routeOf(way.href)}/+page.svelte`;
      expect(existsSync(page), `${way.key} points at ${way.href}, which has no +page.svelte`).toBe(
        true
      );
    }
  });

  it('lands each way on the screen itself rather than on a redirect to it', () => {
    /* A `+page.ts` beside no `+page.svelte` is this repo's redirect stub
       (ADR-0036). The row on the screen a person opens on their worst day
       is the one place in the app that should not spend a navigation on
       one, so the ways are held to the destination rather than to the
       address that used to reach it. */
    for (const way of SAFE_SPACE_WAYS) {
      const route = routeOf(way.href);
      const stub = `${root}src/routes${route}/+page.ts`;
      const screen = `${root}src/routes${route}/+page.svelte`;
      expect(
        existsSync(stub) && !existsSync(screen),
        `${way.key} points at ${way.href}, which is a redirect stub`
      ).toBe(false);
    }
  });

  it('anchors a way into the middle of a screen only where that screen names the section', () => {
    /* `#opened` is the letters screen's Open section (ticket 15). An
       anchor nothing answers scrolls nowhere, and the person who most needs
       it is the one who tapped this row. */
    for (const way of SAFE_SPACE_WAYS) {
      const [route, fragment] = way.href.split('#');
      if (!fragment) continue;
      const source = readFileSync(`${root}src/routes${route}/+page.svelte`, 'utf8');
      expect(source, `${way.key} links to #${fragment}, which ${route} does not name`).toContain(
        `id="${fragment}"`
      );
    }
  });

  it('draws every way with an icon the kit actually has', async () => {
    /* Imported rather than grepped, so an icon renamed out of the set fails
       here instead of rendering nothing on the screen. */
    const { PATHS } = await import('../components/icons.ts');
    for (const way of SAFE_SPACE_WAYS) {
      expect(Object.keys(PATHS), `${way.key} draws ${way.icon}`).toContain(way.icon);
    }
  });
});
