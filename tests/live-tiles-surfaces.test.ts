/* The rules the consolidated live-tiles screen keeps (ticket 51), at the
   level a screen's source can be held to - mirrors settings-surfaces.test.ts.

   The rows' content is rows.test.ts's business (one per kind, which
   preference each reads); this file holds only what the markup promises:
   that the screen renders the registry rather than hand-written rows, and
   that a row carrying a Switch is a plain div, not a control nested in a
   control. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const page = readFileSync(root + 'src/routes/settings/live-tiles/+page.svelte', 'utf8');
const withoutScript = page.replace(/<script[\s\S]*?<\/script>/g, '');

describe('what the live-tiles screen is built from', () => {
  it('draws its rows from the registry, not from hand-written markup', () => {
    expect(page).toContain("from './rows.ts'");
    expect(withoutScript).toContain('{#each LIVE_TILE_ROWS as row (row.key)}');
    /* One row shape, one {#each}: a kind added to the array needs no edit
       here. */
    expect(withoutScript.match(/<div class="kit-row"/g)?.length).toBe(2);
  });

  it('gives rows that carry a switch no interactive wrapper of their own', () => {
    expect(page).not.toContain("kit/ListRow.svelte");
    expect(withoutScript).toMatch(/<div class="kit-row" data-live-tile=\{row\.key\}>/);
    expect(withoutScript).toMatch(/<div class="kit-row" data-live-tile-notify=\{row\.key\}/);
  });

  it('reaches back to Settings and names its sub-toggle gating in the markup', () => {
    expect(withoutScript).toContain('back="/settings"');
    expect(withoutScript).toContain('!isWeb && prefs[row.prefKey]');
  });
});
