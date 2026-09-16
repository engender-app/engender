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

  it('draws its rows from two templated ListRows, the grouped one and the searched one', () => {
    /* Two, since redesign ticket 15: the row the grouped index draws and the
       row a search match draws. The Settings row that used to be the second
       one is gone (the assertion below), and the record hits' row is not
       self-closing - it carries a trailing snippet for the hit's date. */
    const rowTags = markup.match(/<ListRow\b[^>]*\/>/gs) ?? [];
    expect(rowTags.length).toBe(2);
  });

  it('holds no Settings row and no pointer to preferences (redesign tickets 09 and 15)', () => {
    /* A door named Transition cannot hold a row about appearance and data:
       preferences are chrome, not part of anybody's transition (ADR-0036,
       ADR-0076). They are reached from the gear in Today's header and the
       rail's fifth row, which ticket 09 owns. `/settings` stopped being a
       *host* with redesign ticket 51 (ADR-0084): entry templates is a plain
       row on that screen now, not one this file's registry still owns. */
    expect(more).not.toContain('/settings');
    expect(more).not.toContain('nav_settings');
  });

  it('puts the search box on the field and nothing else there (DIRECTION.md rule 7)', () => {
    const field = /\{#snippet field\(\)\}([\s\S]*?)\{\/snippet\}/.exec(markup)?.[1] ?? '';

    expect(field).toContain('class="search-box"');
    expect(field).toContain('data-hub-search');
    /* The title stays hidden and the field holds no second thing: no
       heading, no count, no control. What is small sits on the page under
       it, which is where the count line is. */
    expect(field).not.toContain('<h');
    expect(field).not.toContain('hub-count');
    expect(markup).toContain('data-hub-count');
  });

  it('searches the areas in memory and the records through the registry', () => {
    /* Both halves of what is behind this door, and neither rule is written
       here: which rows a query matches is `hubRowsMatching` over the
       assembled sections (so a hidden area cannot be searched up), and the
       records are the same read and the same presentation the search
       screen's second half uses. */
    expect(more).toContain('hubRowsMatching(');
    expect(more).toContain('j.textSearch.search(');
    expect(more).toContain("from '$lib/components/searchHitRows'");
    expect(more).not.toMatch(/foldText|likePattern/);
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

  it('issues three live reads for twenty rows, not one per row', () => {
    /* The whole shape of phase 8 UX ticket 02: the lines come out of one
       assembled last-write call plus the area record. `hub-last-writes` in
       tests/long-journal/budgets.json is what holds the cost of the first
       one; this holds the count.

       Three until ticket 16, the third being the regimen episode list that
       only ADR-0043's gate needed. Three again since redesign ticket 15, and
       that third one asks nothing until somebody types: the search's record
       half returns a resolved empty answer for an empty box.

       Four since phase 11 all-four-doors ticket 02, and the fourth is one
       assembled call for the same reason the first is: what every row has to
       say facing forwards, rather than a read per row for the milestone, the
       letter, the wear session, the tryout, the appointment, the procedure,
       the dose slot, the stock and the measurement. */
    const reads = more.match(/live(?:Query|List)\(/g) ?? [];

    expect(reads).toHaveLength(4);
    expect(more).toContain('j.lastWrite.getLastWrites(today)');
    expect(more).toContain('j.areaStates.getAreaStates()');
    expect(more).toContain('readRowForward(j, today)');
    expect(more).toMatch(/if \(!asked\) return Promise\.resolve/);
  });

  it('leaves every word of every row to the vocabulary module', () => {
    /* A title or a line written inline here is one `hubLabels.ts`'s full
       `Record` over the row keys cannot see missing. So every `m.` call left
       in the screen is named, and none of them is a row's own words: the
       hidden screen title, the search box's own label, and the five strings
       the results share with the search screen, which reads the same
       registry (redesign ticket 15). */
    const paraglide = [...new Set(more.match(/\bm\.[a-z_]+\(/g) ?? [])];

    expect(paraglide.sort()).toEqual([
      'm.hub_screen_title(',
      'm.hub_search_clear(',
      'm.hub_search_placeholder(',
      'm.list_more(',
      'm.no_results(',
      'm.no_results_body(',
      'm.results_count(',
      'm.search_elsewhere_heading('
    ]);
    expect(more).toContain("from '$lib/data/vocabulary/hubLabels'");
  });
});

describe('what the door and its groups are called', () => {
  /* Ticket 08 renamed the tab to Transition; redesign ticket 15 renames the
     group inside it, because "Transition inside Transition" says nothing.
     Both catalogues, since a rename in one language only is how the two
     screens stop agreeing. */
  const catalogue = (locale: string) => JSON.parse(read(`messages/${locale}.json`)) as Record<string, string>;

  it('calls the group Steps in both languages', () => {
    expect(catalogue('en').hub_group_transition).toBe('Steps');
    expect(catalogue('pl').hub_group_transition).toBe('Kroki');
  });

  it("names the same five groups in the hidden screen title, which is what the title is for", () => {
    /* `hubRows.ts` says this string goes stale the moment a group is added,
       renamed or reordered. The rename is exactly that moment. */
    expect(catalogue('en').hub_screen_title).toBe('Body, health, steps, support and media');
    expect(catalogue('pl').hub_screen_title).toBe('Ciało, zdrowie, kroki, wsparcie i media');
    expect(HUB_GROUP_KEYS).toHaveLength(5);
  });

  it('keeps no string for the Settings row that left the door', () => {
    expect(catalogue('en').hub_settings_row_sub).toBeUndefined();
    expect(catalogue('pl').hub_settings_row_sub).toBeUndefined();
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
     unintended change to any of it.

     Redesign ticket 51 (ADR-0084) took `presentations` and `entry-templates`
     further still: both are reference areas, so both left this registry
     entirely for a plain row on /settings, the same way tag groups and body
     regions were never on it at all. Twenty-five rows then, not twenty-seven.

     Redesign ticket 61 folded `sizes` into `measurements` rather than moving
     it: one row fronting two archive sections, which is `hair-progress`'s
     own shape. Twenty-three rows then.

     Redesign ticket 62 took `words` off outright, and it is the first row to
     go without its screen going anywhere else: the reading it opened draws
     on the Look back door itself now, so there is nothing left for a row to
     point at. `stats` stopped being a host with it. Twenty-two rows now. */
  const EXPECTED: [string, string, string, string, 'read' | 'written'][] = [
    ['measurements', 'ruler', '/body/measurements', 'body', 'read'],
    ['care', 'timeline', '/care', 'health', 'written'],
    ['surgery', 'flag', '/health/surgery', 'health', 'read'],
    ['appointments', 'check', '/health/appointments', 'health', 'read'],
    ['eras', 'columns', '/transition/eras', 'transition', 'written'],
    ['milestones', 'sparkle', '/transition/milestones', 'transition', 'read'],
    ['tryouts', 'tag', '/transition/tryouts', 'transition', 'read'],
    ['voice-benchmark', 'curve', '/practice/voice?tab=record', 'transition', 'read'],
    ['wear', 'clock', '/practice/wear', 'transition', 'read'],
    ['hair-removal', 'shuffle', '/body/hair-removal', 'transition', 'read'],
    ['roadmap', 'globe', '/transition/roadmap', 'transition', 'written'],
    ['letters', 'book', '/transition/letters', 'transition', 'written'],
    ['doubt', 'heart', '/doubt', 'support', 'written'],
    ['resources', 'info', '/practice/resources', 'support', 'written'],
    ['photos', 'image', '/media/photos', 'media', 'written'],
    ['voice', 'mic', '/media/voice/memos', 'media', 'written'],
    ['documents', 'documents', '/media/documents', 'media', 'read'],
    ['effects', 'eye', '/practice/personal-effects', 'care', 'read'],
    ['side-effects', 'zap', '/health/side-effects', 'effects', 'read'],
    ['hair-progress', 'comb', '/body/hair-progress', 'effects', 'read'],
    ['cycle-events', 'calendar', '/health/cycle-events', 'side-effects', 'read'],
    ['dilation', 'flask', '/health/dilation', 'surgery', 'read']
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
