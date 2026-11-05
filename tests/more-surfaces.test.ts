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
const personalEffects = read('src/routes/care/changes/+page.svelte');

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

  it('draws its rows from three templated ListRows, the grouped one, the searched one and the handoff', () => {
    /* Two since redesign ticket 15 - the row the grouped index draws and the
       row a search match draws - and a third since audit item 11, the one
       row that carries a record query to the search screen. The Settings row
       that used to be the second one is gone (the assertion below), and the
       record hits' row is not self-closing: it carries a trailing snippet
       for the hit's date. */
    const rowTags = markup.match(/<ListRow\b[^>]*\/>/gs) ?? [];
    expect(rowTags.length).toBe(3);
    expect(markup).toContain('data-hub-search-handoff');
    /* In memory, not in the address: a query in `/search?q=` lands in the
       browser's history (after-release ticket 10, audit L09-02). */
    expect(markup).not.toContain('/search?q=');
    expect(markup).toContain('onclick={handOffSearch}');
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

  it('answers the cycle gate before it draws the cycle row (ADR-0043)', () => {
    /* The cycle row is a hub row again (pre-release-human 12: "cycle and
       dilation should be appearing in care"), so the hub screen is the one
       that asks `cycleTrackingVisible`, reads the episodes with its other
       reads, and hands the answer to the registry, which leaves the row out
       of the list and of search until it is true. Until the reads land the
       answer is no. */
    expect(more).toContain("from '$lib/data/cycleTracking'");
    expect(more).toContain('cycleTrackingVisible(');
    expect(more).toContain('cycleVisible: false');
    expect(more).toContain('episodesQuery.value !== undefined');
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
       the dose slot, the stock and the measurement.

       Five since phase 11 ticket 17: voice-benchmark's own second read, a
       memo's last write, which has no place in the first call because a
       memo has no archive section of its own to be registered under
       (ADR-0036) - one more assembled call rather than a read hubRows.ts
       forces onto the registry it does not belong in.

       Six since pre-release-human 12: the regimen episode list, which only
       ADR-0043's gate for the cycle row needs, is back as it was before
       ticket 16 took the row off the hub. */
    const reads = more.match(/live(?:Query|List)\(/g) ?? [];

    expect(reads).toHaveLength(6);
    expect(more).toContain('j.regimen.getEpisodes()');
    expect(more).toContain('j.lastWrite.getLastWrites(today)');
    expect(more).toContain('j.areaStates.getAreaStates()');
    expect(more).toContain('readRowForward(j, today)');
    expect(more).toContain('j.voice.lastWriteEpochDay(today)');
    expect(more).toMatch(/if \(!asked\) return Promise\.resolve/);
  });

  it('leaves every word of every row to the vocabulary module', () => {
    /* A title or a line written inline here is one `hubLabels.ts`'s full
       `Record` over the row keys cannot see missing. So every `m.` call left
       in the screen is named, and none of them is a row's own words: the
       hidden screen title, the search box's own label, the strings the
       results share with the search screen, which reads the same registry
       (redesign ticket 15), and the row that hands a record query over to
       that screen (audit item 11). `m.list_more` went with the paging
       button the same item deleted. */
    const paraglide = [...new Set(more.match(/\bm\.[a-z_]+\(/g) ?? [])];

    expect(paraglide.sort()).toEqual([
      'm.hub_screen_title(',
      'm.hub_search_clear(',
      'm.hub_search_handoff(',
      'm.hub_search_handoff_sub(',
      'm.hub_search_placeholder(',
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
    expect(catalogue('en').hub_screen_title).toBe('Health, body, steps, support and media');
    expect(catalogue('pl').hub_screen_title).toBe('Zdrowie, ciało, kroki, wsparcie i media');
    expect(HUB_GROUP_KEYS).toHaveLength(5);

    // Body was folded in audit item 10 and came back in pre-release-human 12.
    expect(catalogue('en').hub_group_body).toBe('Body');
    expect(catalogue('pl').hub_group_body).toBe('Ciało');
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
     and doses behind the care row - the three surfaces /care
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

     Redesign ticket 62 took `words` off outright, and it is the first row to
     go without its screen going anywhere else: the reading it opened draws
     on the Look back door itself now, so there is nothing left for a row to
     point at. `stats` stopped being a host with it. Twenty-two rows then.

     Phase 11 all-four-doors ticket 13 folded `side-effects` into `effects`
     rather than moving it: side effects finish and read on the same screen
     and the same axis as the changes somebody was hoping for now, so there
     is one row where there were two, and `cycle-events` moved with it -
     `effects` hosts it, not `side-effects`, which is not a host at all any
     more. Twenty-one rows then.

     Redesign ticket 16 (ADR-0084) took `eras` off outright, the same way
     ticket 62 took `words` off: eras is a reference area, spent on seven
     other screens and created on exactly one, so it moved to Settings and
     left this registry rather than moving screens within it. Twenty rows
     then.

     Phase 11 ticket 17 folded `voice` into `voice-benchmark`: the memos
     browser is a fourth tab on the voice screen now rather than a screen of
     its own, `/media/voice/memos` redirects there, and `voice-benchmark`'s
     own href drops `?tab=record` since that is already the screen's
     default tab. Nineteen rows now.

     Audit item 10 folded the `body` group into `health`: it was one row
     under a heading, and the row is what says what it is about. Nothing
     about the row itself moved - the same key, icon and address - so this
     table changes in one column.

     Pre-release-human 12 added `progress-photos` after Milestones: posed
     shots split off the photo library, which became browse-only. */
  const EXPECTED: [string, string, string, string, 'read' | 'written'][] = [
    ['care', 'pill', '/care', 'health', 'written'],
    ['cycle-events', 'calendar', '/health/cycle-events', 'health', 'read'],
    ['appointments', 'appointment', '/health/appointments', 'health', 'read'],
    ['surgery', 'clipboard', '/health/surgery', 'health', 'read'],
    ['dilation', 'repeat', '/health/dilation', 'health', 'read'],
    ['progress-photos', 'progressShot', '/transition/progress-photos', 'body', 'read'],
    ['effects', 'sprout', '/care/changes', 'body', 'read'],
    ['hair-removal', 'razor', '/body/hair-removal', 'body', 'read'],
    ['wear', 'watch', '/body/wear', 'body', 'read'],
    ['voice-benchmark', 'waveform', '/voice', 'body', 'read'],
    ['roadmap', 'route', '/transition/roadmap', 'transition', 'written'],
    ['milestones', 'summit', '/transition/milestones', 'transition', 'read'],
    ['tryouts', 'hanger', '/transition/tryouts', 'transition', 'read'],
    ['letters', 'envelope', '/transition/letters', 'support', 'written'],
    ['doubt', 'shelter', '/doubt', 'support', 'written'],
    ['resources', 'lifebuoy', '/support/resources', 'support', 'written'],
    ['photos', 'image', '/media/photos', 'media', 'written'],
    ['documents', 'documents', '/media/documents', 'media', 'read'],
    ['hair-progress', 'comb', '/body/hair-progress', 'effects', 'read']
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

       Hosted means `home` names a screen in `HUB_ROW_HOSTS`. Two rows are
       on the hub and also linked from a screen (pre-release-human 12),
       which is a link rather than a home: the next test holds those. */
    for (const [key, , href, home] of EXPECTED) {
      if ((HUB_GROUP_KEYS as readonly string[]).includes(home)) continue;
      const host = HUB_ROW_HOSTS[home as HubRowHostKey];
      expect(host, `${key} names ${home}, which hosts nothing`).toBeTruthy();
      const source = read(`src/routes${host}/+page.svelte`);

      expect(source, `${host} does not draw its rows through HostedRows`).toContain(`<HostedRows host="${home}"`);
      expect(source, `${host} writes ${key} out by hand instead`).not.toContain(href);
    }
  });

  it('links to cycle events and dilation from the screens that sit next to them', () => {
    /* Alicja, 2026-11-05: both are modules on the hub in Health, and a link
       to each stays where it was useful - dilation on the surgery list, a
       link to the cycle log on Meds. So "a hosted row is reachable from one
       place" does not hold for these two, on purpose. Both go through
       HostedRows, which keeps the hidden-area rule and the ended-day line;
       Meds' link is gated on `cycleTrackingVisible`, and dilation's by
       `dilationGated` inside the component. */
    const hosted = read('src/lib/components/HostedRows.svelte');
    expect(hosted).toContain('dilationGated(');

    const surgery = read('src/routes/health/surgery/+page.svelte');
    expect(surgery).toContain(`<HostedRows host="surgery" keys={['dilation']}`);
    expect(surgery).not.toContain('href="/health/dilation"');

    const care = read('src/routes/care/+page.svelte');
    expect(care).toContain(`keys={cycleShown ? ['cycle-events'] : []}`);
    expect(care).toContain('cycleTrackingVisible(');
    expect(care).not.toContain('href="/health/cycle-events"');

    const changes = read('src/routes/care/changes/+page.svelte');
    expect(changes).not.toContain('/health/cycle-events');
    expect(changes).not.toContain('cycleTrackingVisible');

    expect(HUB_ROW_HOSTS).not.toHaveProperty('care');
    expect(HUB_ROW_HOSTS).not.toHaveProperty('surgery');
  });

  it('draws the last three cycle events inside the Cycle link card, held with it', () => {
    /* Alicja, 2026-11-05: the preview that left Changes comes back on Meds,
       with the link. It is a `before` snippet of the same HostedRows card, so
       it sits in the link's own ReadReserve and fades in with it, and the
       card's `ready` waits for the events' read when the gate is open. A
       preview drawn beside the card, or released before its read, would
       arrive after the link. */
    const hosted = read('src/lib/components/HostedRows.svelte');
    expect(hosted).toContain('{@render before?.()}');

    const care = read('src/routes/care/+page.svelte');
    expect(care).toContain('j.cycleEvents.getCycleEvents()');
    expect(care).toContain('.slice(0, 3)');
    expect(care).toContain('{#snippet before()}');
    expect(care).toContain('(!cycleShown || !cycleEventsQuery.loading)');
    expect(care).toContain('data-cycle-event={event.id}');
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

describe("a module's own screen draws the hub's mark for it", () => {
  /* pre-release-human 12 redrew the hub's marks, and a screen that still
     drew the row's old one for its own records said the module was
     something else once you were inside it: hair removal's sessions were
     still the shuffle arrows under a razor row. Each line is a file, the
     hub row whose records it draws, and the mark that row drew before. */
  const SCREENS: [string, string, string][] = [
    ['src/routes/body/hair-removal/+page.svelte', 'hair-removal', 'shuffle'],
    ['src/routes/body/wear/+page.svelte', 'wear', 'clock'],
    ['src/routes/transition/tryouts/+page.svelte', 'tryouts', 'tag'],
    ['src/routes/health/appointments/+page.svelte', 'appointments', 'calendar'],
    ['src/routes/health/surgery/+page.svelte', 'surgery', 'flag'],
    ['src/routes/transition/letters/+page.svelte', 'letters', 'book'],
    ['src/routes/transition/letters/[id]/+page.svelte', 'letters', 'book'],
    ['src/lib/components/LookBackLetterCard.svelte', 'letters', 'book'],
    ['src/lib/components/LetterCard.svelte', 'letters', 'book'],
    ['src/routes/transition/milestones/+page.svelte', 'milestones', 'flag'],
    ['src/routes/transition/milestones/+page.svelte', 'milestones', 'sparkle'],
    ['src/routes/transition/roadmap/+page.svelte', 'milestones', 'sparkle'],
    ['src/lib/components/WrappedYear.svelte', 'milestones', 'flag'],
    ['src/lib/components/WrappedCompact.svelte', 'milestones', 'flag'],
    ['src/routes/care/changes/+page.svelte', 'effects', 'zap']
  ];

  it.each(SCREENS)('%s draws %s with its hub mark', (file, key, old) => {
    const source = read(file);
    const mark = HUB_ROWS.find((row) => row.key === key)!.icon;
    expect(source).not.toMatch(new RegExp(`(icon|name)="${old}"`));
    expect(source).toMatch(new RegExp(`(icon|name)="${mark}"`));
  });

  it('marks a day-ahead row, a filed document and a returning row the same way', () => {
    const icon = (key: string) => HUB_ROWS.find((row) => row.key === key)!.icon;
    const dayAhead = read('src/lib/components/dayAheadRows.ts');
    expect(dayAhead).toContain(`appointment: () => ({ icon: '${icon('appointments')}'`);
    expect(dayAhead).toContain(`surgery: () => ({ icon: '${icon('surgery')}'`);
    expect(dayAhead).toContain(`letterUnlock: () => ({ icon: '${icon('letters')}'`);
    const targets = read('src/lib/data/vocabulary/documentTargetLabels.ts');
    expect(targets).toContain(`procedure: '${icon('surgery')}'`);
    expect(targets).toContain(`goal: '${icon('roadmap')}'`);
    expect(targets).toContain(`milestone: '${icon('milestones')}'`);
    expect(dayAhead).toContain(`milestone: () => ({ icon: '${icon('milestones')}'`);
    expect(read('src/routes/coming-back/+page.svelte')).toMatch(new RegExp(`data-coming-back-item="milestone"\\s+icon="${icon('milestones')}"`));
    /* The take-a-photo button keeps its camera: that is an action, not the module. */
    expect(read('src/routes/transition/progress-photos/+page.svelte')).toContain(`icon="${icon('progress-photos')}"`);
    const comingBack = read('src/routes/coming-back/+page.svelte');
    expect(comingBack).toMatch(new RegExp(`data-coming-back-item="letter"\\s+icon="${icon('letters')}"`));
    expect(comingBack).toMatch(new RegExp(`data-coming-back-item="wear-session"\\s+icon="${icon('wear')}"`));
    const today = read('src/routes/+page.svelte');
    expect(today).toContain(`area: 'milestones', icon: '${icon('milestones')}'`);
    expect(today).toContain(`area: 'letters', icon: '${icon('letters')}'`);
    expect(read('src/lib/data/safeSpaceWays.ts')).toContain(`{ key: 'resources', icon: '${icon('resources')}'`);
  });
});

describe('a mark names one thing (pre-release-human 12 icon audit)', () => {
  /* The audit after the hub redo found marks that still meant what they
     meant before it: a dose drawn as a clock, a milestone as the old flag,
     surgery's phases as three borrowed marks, and Settings rows wearing
     marks that already stood for something else one row away. Each line is
     a file, the place in it (with ICON where the mark goes), the mark it
     draws now and the one it drew before. */
  const icon = (key: string) => HUB_ROWS.find((row) => row.key === key)!.icon;
  const PLACES: [string, string, string, string][] = [
    ['src/lib/components/QuickAdd.svelte', 'onclick={ACTIONS.dose}\\s*>\\s*<span class="fan-icon"><Icon name="ICON"', icon('care'), 'clock'],
    ['src/lib/components/QuickAdd.svelte', "<Icon name={running \\? 'stop' : 'ICON'}", icon('wear'), 'timeline'],
    ['src/routes/coming-back/+page.svelte', 'data-coming-back-item="dose"\\s+icon="ICON"', icon('care'), 'clock'],
    ['src/routes/care/regimen/+page.svelte', 'key="doses" icon="ICON"', icon('care'), 'timeline'],
    ['src/lib/data/vocabulary/documentTargetLabels.ts', "episode: 'ICON'", icon('care'), 'timeline'],
    ['src/lib/components/ProcedureRecoveryCard.svelte', 'data-linked-milestone>\\s*<Icon name="ICON"', icon('milestones'), 'flag'],
    ['src/routes/health/surgery/[id]/+page.svelte', 'icon="ICON"\\s+key="surgery-milestone-linked"', icon('milestones'), 'flag'],
    ['src/routes/health/surgery/[id]/+page.svelte', 'icon="ICON"\\s+key="surgery-milestone-prompt"', icon('milestones'), 'flag'],
    ['src/routes/transition/letters/+page.svelte', '<Icon name="ICON" size=\\{16\\} />{mi.name}', icon('milestones'), 'flag'],
    ['src/routes/health/appointments/[id]/+page.svelte', 'data-appointment-procedure={stored.procedureId}\\s+icon="ICON"', icon('surgery'), 'flag'],
    ['src/routes/health/surgery/[id]/+page.svelte', 'icon="ICON"\\s+key="surgery-preop"', icon('surgery'), 'clock'],
    ['src/routes/health/surgery/[id]/+page.svelte', 'icon="ICON"\\s+key="surgery-today"', icon('surgery'), 'flag'],
    ['src/routes/health/surgery/[id]/+page.svelte', 'icon="ICON"\\s+key="surgery-recovery"', icon('surgery'), 'heart'],
    ['src/routes/health/appointments/in-the-room/+page.svelte', 'data-visit-pick={appointment.id}\\s+icon="ICON"', icon('appointments'), 'calendar'],
    ['src/lib/components/ProcedureRecoveryCard.svelte', '<Icon name="ICON" size=\\{13\\} />\\s*<span aria-hidden="true">{procedure.consults.length}', icon('appointments'), 'calendar'],
    ['src/routes/+page.svelte', 'icon="ICON"\\s+key="debrief-offer"', icon('appointments'), 'calendar'],
    ['src/routes/settings/+page.svelte', 'data-cycle-tracking-toggle>\\s*<span class="kit-row-ico"><Icon name="ICON"', icon('cycle-events'), 'curve'],
    ['src/routes/settings/+page.svelte', 'data-genital-effects-toggle>\\s*<span class="kit-row-ico"><Icon name="ICON"', icon('effects'), 'sparkle'],
    ['src/routes/care/changes/+page.svelte', 'icon="ICON"\\s+key="effects-no-regimen"', icon('effects'), 'sparkle'],
    ['src/lib/components/BodyRegionInspectorSheet.svelte', 'icon="ICON"\\s+title={`\\${hairRemovalAreaName', icon('hair-removal'), 'sparkle'],
    ['src/lib/components/BodyRegionInspectorSheet.svelte', 'icon="ICON"\\s+title={hairStagingText\\(st\\)}', icon('hair-progress'), 'eye'],
    ['src/routes/transition/tryouts/[id]/+page.svelte', 'icon="ICON"\\s+key="tryout-compare"', 'columns', 'shuffle'],
    ['src/routes/health/surgery/[id]/+page.svelte', 'icon="ICON"\\s+key="surgery-compare"', 'columns', 'shuffle'],
    ['src/routes/compare/+page.svelte', 'key="compare-shortcut"\\s+icon="ICON"', 'columns', 'shuffle'],
    ['src/routes/stats/+page.svelte', '<Notice icon="ICON" key="lookback-empty"', 'stats', 'clock'],
    ['src/routes/voice/+page.svelte', 'icon="ICON"\\s+key="voice-benchmark-empty"', icon('voice-benchmark'), 'mic'],
    ['src/lib/components/VoicePracticeTakes.svelte', 'icon="ICON"\\s+key="voice-practice-takes-empty"', icon('voice-benchmark'), 'mic'],
    ['src/lib/components/VoicePracticeTakes.svelte', '{:else}\\s*<span class="kit-row-ico"><Icon name="ICON" size=\\{20\\} />', icon('voice-benchmark'), 'mic'],
    ['src/lib/components/ProcedureFields.svelte', 'aria-haspopup="dialog"\\s+icon="ICON"', icon('surgery'), 'tag'],
    ['src/lib/permissions/catalogue.ts', "print: 'ICON'", 'print', 'documents'],
    ['src/lib/components/EntryEditor.svelte', 'data-add-recording-file[^\\n]*\\n\\s*<Icon name="ICON"', 'upload', 'image'],
    ['src/lib/components/EntryEditor.svelte', '<Icon name="ICON" size=\\{22\\} /><span>{m.add_video_file\\(\\)}', 'upload', 'image'],
    ['src/routes/health/appointments/+page.svelte', 'data-provider={provider.id}\\s+icon="ICON"', 'person', 'note'],
    ['src/routes/health/appointments/+page.svelte', 'icon="ICON"\\s+key="providers-empty"', 'person', 'note'],
    ['src/routes/settings/+page.svelte', 'key="scales"\\s+icon="ICON"', 'scales', 'heart'],
    ['src/routes/settings/+page.svelte', 'key="body-regions" icon="ICON"', 'figure', 'heart'],
    ['src/routes/settings/+page.svelte', 'key="entry-templates" icon="ICON"', 'template', 'grid'],
    ['src/lib/components/EntryEditor.svelte', 'data-use-template[^\\n]*\\n\\s*<Icon name="ICON"', 'template', 'sparkle'],
    ['src/routes/settings/+page.svelte', 'key="mood-colours" icon="ICON"', 'mood', 'sparkle'],
    ['src/routes/settings/reminders/+page.svelte', '<Icon name="ICON" size=\\{16\\} /> {m.checkin_title\\(\\)}', 'mood', 'sparkle'],
    ['src/routes/settings/+page.svelte', 'key="notifications" icon="ICON"', 'badge', 'zap'],
    ['src/routes/settings/+page.svelte', 'key="permissions" icon="ICON"', 'toggle', 'key'],
    ['src/routes/settings/+page.svelte', 'key="accessibility" icon="ICON"', 'access', 'eye'],
    /* An era is a sun coming up over a horizon, a new stretch of life
       starting. columns stays the mark for side by side (compare). */
    ['src/routes/settings/+page.svelte', 'key="eras" icon="ICON"', 'era', 'columns'],
    ['src/routes/settings/eras/+page.svelte', 'data-era={era.id}\\s+icon="ICON"', 'era', 'columns'],
    ['src/routes/settings/eras/+page.svelte', 'icon="ICON"\\s+key="eras-empty"', 'era', 'columns'],
    ['src/routes/coming-back/+page.svelte', 'data-coming-back-item="era"\\s+icon="ICON"', 'era', 'columns'],
    ['src/routes/transition/milestones/+page.svelte', 'data-manage-eras href="/settings/eras">\\s*<Icon name="ICON"', 'era', 'columns'],
    ['src/routes/day/[day]/+page.svelte', '<Icon name="ICON" size=\\{20\\} /><span>{m.era_start_here\\(\\)}', 'era', 'columns'],
    ['src/routes/stats/+page.svelte', 'era-offer-said">\\s*<span class="kit-row-ico"><Icon name="ICON"', 'era', 'columns'],
    ['src/lib/components/searchHitRows.ts', "eras: { icon: 'ICON'", 'era', 'columns'],
    ['src/routes/compare/+page.svelte', 'key="compare-era-row-a"\\s+icon="ICON"', 'era', 'curve'],
    ['src/routes/compare/+page.svelte', 'key="compare-era-row-b"\\s+icon="ICON"', 'era', 'curve']
  ];

  it.each(PLACES)('%s: %s draws %s, not %s', (file, place, mark, old) => {
    const source = read(file);
    const at = (name: string) => new RegExp(place.replace('ICON', name));
    expect(source).not.toMatch(at(old));
    expect(source).toMatch(at(mark));
  });

  it('draws a gendered tally on a day the way quick add does', () => {
    const rows = read('src/lib/components/dayRows.ts');
    expect(rows).toContain("icon: kind === 'misgendered' ? 'x' : 'check'");
    expect(rows).not.toContain("icon: 'stats'");
  });
});
