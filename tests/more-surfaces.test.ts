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
import { HUB_GROUP_KEYS, HUB_ROWS, HUB_ROW_HOSTS, type HubRowHostKey } from '../src/lib/data/hubRows.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

const more = read('src/routes/more/+page.svelte');
const markup = more.replace(/<script[\s\S]*?<\/script>/g, '');
const sideEffects = read('src/routes/health/side-effects/+page.svelte');

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

  it('asks nothing about cycle tracking, since it draws no cycle row (ADR-0043)', () => {
    /* The row is hosted by /health/side-effects now (ticket 16), which was
       already gating its own cycle block on `cycleTrackingVisible`. ADR-0043's
       decision is unchanged and stronger for it: the hub cannot show a cycle
       prompt at all, rather than showing one behind a rule it had to fetch an
       episode list to evaluate. */
    expect(more).not.toContain('cycleTracking');
    expect(more).not.toMatch(/cycleShown/);
    expect(sideEffects).toContain("from '$lib/data/cycleTracking'");
    expect(sideEffects).toContain('cycleTrackingVisible');
  });

  it('issues two live reads for twenty rows, not one per row', () => {
    /* The whole shape of phase 8 UX ticket 02: the lines come out of one
       assembled last-write call plus the area record. `hub-last-writes` in
       tests/long-journal/budgets.json is what holds the cost of the first
       one; this holds the count.

       Three until ticket 16, the third being the regimen episode list that
       only ADR-0043's gate needed. */
    const reads = more.match(/live(?:Query|List)\(/g) ?? [];

    expect(reads).toHaveLength(2);
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
  /* One row per line: key, icon, href, home, and whether the row can report
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
     route. Phase 8 features ticket 52 added `documents`, the media group's
     third row and the first one in it that fronts an area of its own.

     Phase 9 carpet ticket 16 is the reorg: Practice is gone, Support is new,
     and seven rows moved off the hub entirely onto the screen that owns them
     - the fourth column names that screen instead of a group. Its reasons are
     in `hubRows.ts`; what this line-by-line list is for is noticing an
     unintended change to any of it. */
  const EXPECTED: [string, string, string, string, 'read' | 'written'][] = [
    ['measurements', 'ruler', '/body/measurements', 'body', 'read'],
    ['sizes', 'package', '/body/sizes', 'body', 'read'],
    ['care', 'timeline', '/care', 'health', 'written'],
    ['surgery', 'flag', '/health/surgery', 'health', 'read'],
    ['appointments', 'check', '/health/appointments', 'health', 'read'],
    ['clinician-summary', 'share', '/health/clinician-summary', 'health', 'written'],
    ['eras', 'columns', '/transition/eras', 'transition', 'written'],
    ['milestones', 'sparkle', '/transition/milestones', 'transition', 'read'],
    ['tryouts', 'tag', '/transition/tryouts', 'transition', 'read'],
    ['voice-benchmark', 'curve', '/practice/voice?tab=record', 'transition', 'read'],
    ['wear', 'clock', '/practice/wear', 'transition', 'read'],
    ['hair-removal', 'shuffle', '/body/hair-removal', 'transition', 'read'],
    ['roadmap', 'globe', '/transition/roadmap', 'transition', 'written'],
    ['letters', 'book', '/transition/letters', 'transition', 'written'],
    ['presentations', 'palette', '/transition/presentations', 'transition', 'written'],
    ['doubt', 'heart', '/doubt', 'support', 'written'],
    ['resources', 'info', '/practice/resources', 'support', 'written'],
    ['photos', 'image', '/media/photos', 'media', 'written'],
    ['voice', 'mic', '/media/voice/memos', 'media', 'written'],
    ['documents', 'documents', '/media/documents', 'media', 'read'],
    ['effects', 'eye', '/practice/personal-effects', 'care', 'read'],
    ['side-effects', 'zap', '/health/side-effects', 'effects', 'read'],
    ['hair-progress', 'comb', '/body/hair-progress', 'effects', 'read'],
    ['cycle-events', 'calendar', '/health/cycle-events', 'side-effects', 'read'],
    ['dilation', 'flask', '/health/dilation', 'surgery', 'read'],
    ['words', 'note', '/transition/words', 'stats', 'written'],
    ['entry-templates', 'grid', '/practice/entry-templates', 'settings', 'written']
  ];

  it('is exactly this list, in this order', () => {
    expect(HUB_ROWS.map((row) => [row.key, row.icon, row.href, row.home, row.line])).toEqual(EXPECTED);
  });

  it('fills every group the hub draws', () => {
    const used = new Set(EXPECTED.map(([, , , home]) => home));

    expect([...HUB_GROUP_KEYS].filter((key) => !used.has(key))).toEqual([]);
  });

  it('draws every hosted row through the component that applies the hidden rule', () => {
    /* The ticket's own last line - a row that left the hub is reachable from
       exactly one place - and the rule that came off the hub with it.

       Hosted rows started as a literal `<ListRow>` on each host, which
       reached them but silently dropped ADR-0052's consequence: hiding an
       area takes it out of the navigation, and nothing on the host was
       asking. `HostedRows.svelte` applies `rowHidden` and `rowLine` over the
       area record for all of them, so what this asserts is that each host
       goes through it rather than writing the row again - a literal row is
       both a second copy of the icon and href and a row no `hidden` flag can
       reach.

       `side-effects` is the one exception, named in `HUB_ROW_HOSTS`: its
       way-in row is inside a block that screen gates on
       `cycleTrackingVisible`, carries copy of its own, and fronts the one
       area no `hidden` flag can reach at all (ADR-0043). It is held to the
       href instead. */
    const BY_HAND = new Set(['side-effects']);

    for (const [key, , href, home] of EXPECTED) {
      if ((HUB_GROUP_KEYS as readonly string[]).includes(home)) continue;
      const host = HUB_ROW_HOSTS[home as HubRowHostKey];
      expect(host, `${key} names ${home}, which hosts nothing`).toBeTruthy();
      const source = read(`src/routes${host}/+page.svelte`);

      if (BY_HAND.has(home)) {
        expect(source, `${host} does not link to ${key}`).toContain(href);
        continue;
      }
      expect(source, `${host} does not draw its rows through HostedRows`).toContain(`<HostedRows host="${home}"`);
      expect(source, `${host} writes ${key} out by hand instead`).not.toContain(href);
    }
  });

  it('leaves the hidden rule and the row line to hubRows, not to the component', () => {
    /* The component is a .svelte file, so the Node tier cannot mount it and
       `hubRows.test.ts` holds the rules themselves. What is checkable here is
       that it calls them rather than restating either: a `hidden` read of its
       own, or a subtitle picked at the call site, is how this stops being one
       place the rule lives. */
    const hosted = read('src/lib/components/HostedRows.svelte');

    expect(hosted).toContain("from '$lib/data/hubRows'");
    expect(hosted).toContain('rowHidden(');
    expect(hosted).toContain('rowLine(');
    expect(hosted).toContain('hubRowLine(');
    /* No wording of its own: every title and line it draws comes from
       `hubLabels.ts`'s full records over the row keys, the same rule the hub
       screen itself is held to above. */
    expect(hosted.match(/\bm\.[a-z_]+\(/g)).toBeNull();
  });
});
