/* What this file is for: the ways down from Safe space are an order
   somebody argued for, and an order is the one thing a screenshot of the
   screen cannot prove stayed put. Ticket 47's acceptance asks for the
   surfaces to be reachable "in a stated order", so the order is stated here
   and read back.

   The route check is the other half: a way that points at a route nobody
   built is a tap into a 404, and on this screen that lands on a person
   having a bad day. */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SAFE_SPACE_WAYS } from './safeSpaceWays.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));

describe('the ways down from Safe space', () => {
  it('runs in the order ticket 47 states, with the directory above them', () => {
    expect(SAFE_SPACE_WAYS.map((w) => w.key)).toEqual([
      'resources',
      'moments',
      'comfort',
      'evidence',
      'readings'
    ]);
  });

  it('names each way once', () => {
    const keys = SAFE_SPACE_WAYS.map((w) => w.key);
    expect(new Set(keys).size).toBe(keys.length);
    const hrefs = SAFE_SPACE_WAYS.map((w) => w.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('keeps everything Safe space held under /doubt, and the directory where it already lived', () => {
    const own = SAFE_SPACE_WAYS.filter((w) => w.key !== 'resources');
    expect(own.map((w) => w.href)).toEqual([
      '/doubt/moments',
      '/doubt/comfort',
      '/doubt/evidence',
      '/doubt/readings'
    ]);
    expect(SAFE_SPACE_WAYS.find((w) => w.key === 'resources')?.href).toBe('/practice/resources');
  });

  it('points every way at a route that exists', () => {
    for (const way of SAFE_SPACE_WAYS) {
      const page = `${root}src/routes${way.href}/+page.svelte`;
      expect(existsSync(page), `${way.key} points at ${way.href}, which has no +page.svelte`).toBe(
        true
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
