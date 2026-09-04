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
  /* One row per line: key, icon, href, group, and whether the row reports a
     reading of its own areas or states what is behind it.

     Written out here rather than derived, so this is an independent statement
     of the hub and not a restatement of the module's own filter. It was 23
     rows in 5 + 9 + 4 + 5 until deepening ticket 07 put labs, regimen,
     hormone-curve and doses behind the care row - the four surfaces /care
     opens on. Phase 5 deepening ticket 17 added `presentations` and phase 6
     ticket 01 `eras`; phase 6 ticket 07 added `entry-templates`; phase 8
     features ticket 09 split the old voice row in two, ticket 14 added
     `words` and ticket 12 added `dilation`.

     Phase 8 UX ticket 02 moved two rows and no more: `photos` out of Body and
     `voice` out of Practice, into a Media group, because both front content
     that travels inside an entry rather than a series of its own. Three
     duplicated icon pairs are resolved - `milestones` gave up `flag` to the
     surgery journey, `resources` gave up `globe` to the roadmap, and the
     voice benchmark gave up `mic` to the memos - and the personal effects
     row's route says which effects it means. */
  const EXPECTED: [string, string, string, string, 'read' | 'written'][] = [
    ['measurements', 'ruler', '/settings/measurements', 'body', 'read'],
    ['sizes', 'package', '/settings/sizes', 'body', 'read'],
    ['hair-progress', 'comb', '/settings/hair-progress', 'body', 'read'],
    ['hair-removal', 'shuffle', '/settings/hair-removal', 'body', 'read'],
    ['care', 'timeline', '/care', 'health', 'written'],
    ['cycle-events', 'calendar', '/settings/cycle-events', 'health', 'read'],
    ['side-effects', 'zap', '/settings/side-effects', 'health', 'read'],
    ['surgery', 'flag', '/settings/surgery', 'health', 'read'],
    ['dilation', 'flask', '/settings/dilation', 'health', 'read'],
    ['appointment-prep', 'check', '/settings/appointment-prep', 'health', 'written'],
    ['clinician-summary', 'share', '/settings/clinician-summary', 'health', 'written'],
    ['milestones', 'sparkle', '/settings/milestones', 'transition', 'read'],
    ['roadmap', 'globe', '/settings/roadmap', 'transition', 'written'],
    ['letters', 'book', '/settings/letters', 'transition', 'written'],
    ['tryouts', 'tag', '/settings/tryouts', 'transition', 'read'],
    ['presentations', 'palette', '/settings/presentations', 'transition', 'written'],
    ['eras', 'columns', '/settings/eras', 'transition', 'written'],
    ['words', 'note', '/settings/words', 'transition', 'written'],
    ['doubt', 'heart', '/doubt', 'practice', 'written'],
    ['voice-benchmark', 'curve', '/settings/voice?tab=record', 'practice', 'read'],
    ['entry-templates', 'grid', '/settings/entry-templates', 'practice', 'written'],
    ['wear', 'clock', '/settings/wear', 'practice', 'read'],
    ['effects', 'eye', '/settings/personal-effects', 'practice', 'read'],
    ['resources', 'info', '/settings/resources', 'practice', 'written'],
    ['photos', 'image', '/settings/photos', 'media', 'written'],
    ['voice', 'mic', '/settings/voice/memos', 'media', 'written']
  ];

  it('is exactly this list, in this order', () => {
    expect(HUB_ROWS.map((row) => [row.key, row.icon, row.href, row.group, row.line])).toEqual(EXPECTED);
  });

  it('fills every group the hub draws', () => {
    const used = new Set(EXPECTED.map(([, , , group]) => group));

    expect([...HUB_GROUP_KEYS].filter((key) => !used.has(key))).toEqual([]);
  });
});
