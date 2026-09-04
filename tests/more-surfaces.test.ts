/* The rules the More hub keeps after the rebuild (phase 5 ticket 24), at the
   level a screen's source can be held to - mirrors home-surfaces.test.ts,
   which is where this shape of test started.

   Greps by design (ticket 08): the hub's rules are its row list and the
   surfaces it may not reach for, and both are questions about what is and
   is not in the file. Nothing here stands in for a rule that could be
   called instead. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

const more = read('src/routes/more/+page.svelte');
const markup = more.replace(/<script[\s\S]*?<\/script>/g, '');

describe('what the More hub is built from', () => {
  it('takes its surfaces from the kit and draws no card or list-group of its own', () => {
    expect(markup).not.toMatch(/class="[^"]*\bcard\b/);
    expect(markup).not.toMatch(/class="[^"]*\blist-group\b/);
    expect(more).not.toContain("SectionTitle");
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
    /* The row stays written in the list below so its icon, href and group
       are held like any other row's; what changed with ADR-0043 is that a
       filter decides whether it renders. Default and transfemme profiles
       pass through a Health group of 5 rows, not 6. The decision lives in
       cycleTracking.ts, not inline here - the hub only reads its answer. */
    expect(more).toContain("from '$lib/data/cycleTracking'");
    expect(more).toContain('cycleTrackingVisible');
    expect(more).toMatch(/filter\(\(row\) => row\.key !== 'cycle-events'\)/);
  });

  it('keeps every row, with an unchanged icon, href and group', () => {
    /* 24 rows in four groups (5 + 6 + 6 + 7), doubt included - the More
       hub's own header comment gives the same count. It was 23 in
       5 + 9 + 4 + 5 until deepening ticket 07 put labs, regimen,
       hormone-curve and doses behind the care row - the four surfaces /care
       opens on. Phase 5 deepening ticket 17 added `presentations` to the
       Transition group beside `tryouts`, and phase 6 ticket 01 added `eras`
       next to it - both are the person naming something of their own, one a
       way of showing up and one a stretch of time. Phase 8 features ticket
       09 split the old voice row in two - `voice` still opens the memo
       browser, `voice-benchmark` opens the record/practise/compare screen -
       and phase 6 ticket 07 added `entry-templates`; neither of those two
       rows ever joined this list, the same gap ticket 26 found in
       feature-screens.test.ts's `ROUTES`. Nothing else has moved, and no row
       changed its icon or href. */
    const EXPECTED: [string, string, string][] = [
      ['photos', 'image', '/settings/photos'],
      ['measurements', 'ruler', '/settings/measurements'],
      ['sizes', 'package', '/settings/sizes'],
      ['hair-progress', 'comb', '/settings/hair-progress'],
      ['hair-removal', 'shuffle', '/settings/hair-removal'],
      ['care', 'timeline', '/care'],
      ['cycle-events', 'calendar', '/settings/cycle-events'],
      ['side-effects', 'zap', '/settings/side-effects'],
      ['surgery', 'flag', '/settings/surgery'],
      ['appointment-prep', 'check', '/settings/appointment-prep'],
      ['clinician-summary', 'share', '/settings/clinician-summary'],
      ['milestones', 'flag', '/settings/milestones'],
      ['roadmap', 'globe', '/settings/roadmap'],
      ['letters', 'book', '/settings/letters'],
      ['tryouts', 'tag', '/settings/tryouts'],
      ['presentations', 'palette', '/settings/presentations'],
      ['eras', 'columns', '/settings/eras'],
      ['doubt', 'heart', '/doubt'],
      ['voice', 'mic', '/settings/voice/memos'],
      ['voice-benchmark', 'mic', '/settings/voice?tab=record'],
      ['entry-templates', 'grid', '/settings/entry-templates'],
      ['wear', 'clock', '/settings/wear'],
      ['effects', 'sparkle', '/settings/effects'],
      ['resources', 'globe', '/settings/resources'],
    ];
    for (const [key, icon, href] of EXPECTED) {
      // voice-benchmark's own href carries a `?`, a regex quantifier if
      // pasted in raw - the one row here with a query string.
      const literalHref = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(more).toMatch(new RegExp(`key: '${key}', icon: '${icon}'.*href: '${literalHref}'`));
    }
  });
});
