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
import { AREA_GROUP_ROW_KEYS } from '../data/hubRows.ts';

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
      { route: 'body/hair-progress', group: 'hair-progress' },
      { route: 'body/hair-removal', group: 'hair-removal' },
      { route: 'body/measurements', group: 'measurements' },
      { route: 'body/sizes', group: 'sizes' },
      { route: 'health/dilation', group: 'dilation' },
      { route: 'health/side-effects', group: 'side-effects' },
      { route: 'practice/personal-effects', group: 'effects' },
      { route: 'practice/voice', group: 'voice' },
      { route: 'practice/wear', group: 'wear' }
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

  it('names groups the More hub has rows for, and the same screen owns both', () => {
    /* `areaLabels.ts` claims each group's name is the hub row's own, and this
       is what catches the two drifting apart. It used to grep the hub's route
       for `key: '<group>'`, since the row list was written inline in a
       route a data module could not import; phase 8 UX ticket 02 moved the
       rows into `hubRows.ts`, which declares the mapping outright - so the
       check can now be that the row fronting a group is on the same screen
       the finish control is mounted on, rather than that the hub file happens
       to contain a matching string. */
    for (const key of AREA_GROUP_KEYS) {
      expect(Object.keys(AREA_GROUP_ROW_KEYS), key).toContain(key);
    }

    const owner = Object.fromEntries(mounts.map((m) => [m.group, m.route]));
    expect(AREA_GROUP_ROW_KEYS).toEqual({
      measurements: 'measurements',
      sizes: 'sizes',
      wear: 'wear',
      'hair-progress': 'hair-progress',
      'hair-removal': 'hair-removal',
      'side-effects': 'side-effects',
      effects: 'effects',
      voice: 'voice-benchmark',
      dilation: 'dilation'
    });
    /* The two names differ for exactly one group, and on purpose: `voice`
       finishes the benchmarks and the practice takes together, and the row
       that fronts both is the benchmark row - the memos row is entry content
       and is not finishable at all. */
    expect(owner['voice']).toBe('practice/voice');
  });
});
