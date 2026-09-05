/* The rules the More hub keeps after the rebuild (phase 5 ticket 24), at the
   level a screen's source can be held to - mirrors home-surfaces.test.ts,
   which is where this shape of test started.

   Greps for the questions that are genuinely about what is and is not in the
   file: which surfaces the screen reaches for, and how many reads it issues.
   Phase 8 UX ticket 02 took the row list out of the grep's hands - it lives
   in `hubRows.ts` now and is asserted against below as a value, which is what
   a grep over four const arrays was standing in for. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HUB_GROUP_KEYS, HUB_ROWS } from '../src/lib/data/hubRows.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

const more = read('src/routes/more/+page.svelte');
const markup = more.replace(/<script[\s\S]*?<\/script>/g, '');

describe('what the More hub is built from', () => {
  it('takes its surfaces from the kit and draws no card or list-group of its own', () => {
    expect(markup).not.toMatch(/class="[^"]*\bcard\b/);
    expect(markup).not.toMatch(/class="[^"]*\blist-group\b/);
    expect(more).not.toContain('SectionTitle');
    expect(more).toContain("from '$lib/components/kit/ListCard.svelte'");
    expect(more).toContain("from '$lib/components/kit/ListRow.svelte'");
    expect(more).toContain("from '$lib/components/kit/SectionHeading.svelte'");
  });

  it('hides its own screen title, since the tab already says "More" (DIRECTION.md 3d)', () => {
    expect(markup).toMatch(/<ScreenHeader\s[^>]*titleHidden/);
  });

  it('draws every group row from one templated ListRow, plus the trailing Settings row', () => {
    const rowTags = markup.match(/<ListRow\b[^>]*\/>/gs) ?? [];
    expect(rowTags.length).toBe(2); // the templated hub row, and the Settings row
  });

  it('reads its section colours from the shell rather than from the document', () => {
    expect(more).toContain("from '$lib/theme/activeFlag.svelte'");
    expect(more).not.toContain('readFlagRoles(');
  });

  it('shows the cycle row only behind the one visibility rule (ADR-0043)', () => {
    /* The row stays written in `hubRows.ts` so its icon, href and group are
       held like any other row's; what ADR-0043 added is that a rule decides
       whether it renders. The decision lives in cycleTracking.ts, and the
       hub passes its answer into `hubSections` rather than filtering here. */
    expect(more).toContain("from '$lib/data/cycleTracking'");
    expect(more).toContain('cycleTrackingVisible');
    expect(more).toMatch(/cycleShown/);
  });

  it('issues three live reads for twenty-six rows, not one per row', () => {
    /* The whole shape of phase 8 UX ticket 02: the lines come out of one
       assembled last-write call plus the area record, beside the regimen
       episode list ADR-0043's gate already needed. `hub-last-writes` in
       tests/long-journal/budgets.json is what holds the cost of the first
       one; this holds the count. */
    const reads = more.match(/live(?:Query|List)\(/g) ?? [];

    expect(reads).toHaveLength(3);
    expect(more).toContain('j.lastWrite.getLastWrites(today)');
    expect(more).toContain('j.areaStates.getAreaStates()');
  });

  it('leaves every word of every row to the vocabulary module', () => {
    /* A title or a line written inline here is one `hubLabels.ts`'s full
       `Record` over the row keys cannot see missing. The two `m.` calls left
       are the hidden screen title and the trailing Settings row, which is
       not one of the journal's areas. */
    const paraglide = more.match(/\bm\.[a-z_]+\(/g) ?? [];

    expect(paraglide.sort()).toEqual(['m.hub_settings_row_sub(', 'm.nav_more(', 'm.nav_settings(']);
    expect(more).toContain("from '$lib/data/vocabulary/hubLabels'");
  });
});

describe('every row the hub carries', () => {
  /* One row per line: key, icon, href, group, and whether the row can report
     a reading of its own areas.

     Written out here rather than derived, so this is an independent statement
     of the hub and not a restatement of the module's own filter. It was 23
     rows in 5 + 9 + 4 + 5 until deepening ticket 07 put labs, regimen,
     hormone-curve and doses behind the care row - the four surfaces /care
     opens on. Phase 5 deepening ticket 17 added `presentations` and phase 6
     ticket 01 `eras`; phase 6 ticket 07 added `entry-templates`; phase 8
     features ticket 09 split the old voice row in two, ticket 14 added
     `words` and ticket 12 added `dilation`.

     Phase 8 UX ticket 02 moved `photos` and `voice` into a new Media group,
     resolved three duplicated icon pairs and renamed the personal effects
     route. Its reasons are in `hubRows.ts`; what this line-by-line list is
     for is noticing an unintended change to any of it. */
  const EXPECTED: [string, string, string, string, 'read' | 'written'][] = [
    ['measurements', 'ruler', '/body/measurements', 'body', 'read'],
    ['sizes', 'package', '/body/sizes', 'body', 'read'],
    ['hair-progress', 'comb', '/body/hair-progress', 'body', 'read'],
    ['hair-removal', 'shuffle', '/body/hair-removal', 'body', 'read'],
    ['care', 'timeline', '/care', 'health', 'written'],
    ['cycle-events', 'calendar', '/health/cycle-events', 'health', 'read'],
    ['side-effects', 'zap', '/health/side-effects', 'health', 'read'],
    ['surgery', 'flag', '/health/surgery', 'health', 'read'],
    ['dilation', 'flask', '/health/dilation', 'health', 'read'],
    ['appointment-prep', 'check', '/health/appointment-prep', 'health', 'written'],
    ['clinician-summary', 'share', '/health/clinician-summary', 'health', 'written'],
    ['milestones', 'sparkle', '/transition/milestones', 'transition', 'read'],
    ['roadmap', 'globe', '/transition/roadmap', 'transition', 'written'],
    ['letters', 'book', '/transition/letters', 'transition', 'written'],
    ['tryouts', 'tag', '/transition/tryouts', 'transition', 'read'],
    ['presentations', 'palette', '/transition/presentations', 'transition', 'written'],
    ['eras', 'columns', '/transition/eras', 'transition', 'written'],
    ['words', 'note', '/transition/words', 'transition', 'written'],
    ['doubt', 'heart', '/doubt', 'practice', 'written'],
    ['voice-benchmark', 'curve', '/practice/voice?tab=record', 'practice', 'read'],
    ['entry-templates', 'grid', '/practice/entry-templates', 'practice', 'written'],
    ['wear', 'clock', '/practice/wear', 'practice', 'read'],
    ['effects', 'eye', '/practice/personal-effects', 'practice', 'read'],
    ['resources', 'info', '/practice/resources', 'practice', 'written'],
    ['photos', 'image', '/media/photos', 'media', 'written'],
    ['voice', 'mic', '/media/voice/memos', 'media', 'written']
  ];

  it('is exactly this list, in this order', () => {
    expect(HUB_ROWS.map((row) => [row.key, row.icon, row.href, row.group, row.line])).toEqual(EXPECTED);
  });

  it('fills every group the hub draws', () => {
    const used = new Set(EXPECTED.map(([, , , group]) => group));

    expect([...HUB_GROUP_KEYS].filter((key) => !used.has(key))).toEqual([]);
  });
});
