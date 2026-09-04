/* Where the finish control is, and where it is not (phase 8 features ticket
   04).

   The ticket's own line: it appears on each finishable area's own screen and
   nowhere else. That is a claim about eight route files, and nothing else in
   the tree can make it - `areaGroups.ts` knows which groups exist and the
   routes know which screen is which, and only this test knows they line up.
   A ninth group added without a screen to finish it on would otherwise be a
   compile-clean feature nobody can reach.

   A source scan, like the clinician summary's print-parity test: these are
   `.svelte` files and the node tier cannot mount one (ADR-0016). */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AREA_GROUPS, AREA_GROUP_KEYS } from '../data/areaGroups.ts';

const root = fileURLToPath(new URL('../../..', import.meta.url));

/** Every `.svelte` file under `src/routes`, with its text. */
function routeFiles(dir: string, found: { path: string; source: string }[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) routeFiles(path, found);
    else if (entry.name.endsWith('.svelte')) found.push({ path, source: readFileSync(path, 'utf8') });
  }
  return found;
}

const mounts = routeFiles(`${root}/src/routes`)
  .filter((file) => file.source.includes('<AreaFinish'))
  .map((file) => ({
    route: file.path.slice(root.length + '/src/routes/'.length).replace('/+page.svelte', ''),
    group: file.source.match(/<AreaFinish group="([^"]+)"/)?.[1]
  }))
  .sort((a, b) => a.route.localeCompare(b.route));

describe('where the finish control is mounted', () => {
  it('is on one screen per finishable group, and on no other screen', () => {
    expect(mounts.map((m) => m.group).sort()).toEqual([...AREA_GROUP_KEYS].sort());
  });

  it('puts each group on the screen that owns it', () => {
    expect(mounts).toEqual([
      { route: 'settings/dilation', group: 'dilation' },
      { route: 'settings/effects', group: 'effects' },
      { route: 'settings/hair-progress', group: 'hair-progress' },
      { route: 'settings/hair-removal', group: 'hair-removal' },
      { route: 'settings/measurements', group: 'measurements' },
      { route: 'settings/side-effects', group: 'side-effects' },
      { route: 'settings/sizes', group: 'sizes' },
      { route: 'settings/voice', group: 'voice' },
      { route: 'settings/wear', group: 'wear' }
    ]);
  });

  it('names no group twice, so no area can be finished from two places', () => {
    const groups = mounts.map((m) => m.group);
    expect(new Set(groups).size).toBe(groups.length);
  });

  it('covers every finishable area through those nine screens', () => {
    /* The sections, not the groups: hair progress and voice are each one
       screen and two areas, so a count of screens would not prove the eleven
       are reachable. */
    const covered = mounts.flatMap((m) => [...AREA_GROUPS[m.group as keyof typeof AREA_GROUPS]]);
    expect(covered.length).toBe(11);
    expect(new Set(covered).size).toBe(11);
  });

  it('names groups the More hub already has rows for', () => {
    /* `areaLabels.ts` claims each group's name is the hub row's own, and
       `AreaGroupKey` is written out by hand beside a hub whose rows a data
       module cannot import (the hub is the UX spec's, and it is a route).
       This is the only thing that catches the two drifting apart. */
    const hub = readFileSync(`${root}/src/routes/more/+page.svelte`, 'utf8');

    for (const key of AREA_GROUP_KEYS) {
      expect(hub, key).toContain(`key: '${key}'`);
    }
  });
});
