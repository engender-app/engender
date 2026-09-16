/* The rules Home keeps after the rebuild (phase 5 ticket 21, closing spec
   08), at the level a screen's source can be held to.

   Most of what makes the screen right is proportion and colour, which only
   an eye settles - .claude/ticket-21/shoot-home.mjs is where that happens,
   and the walkthrough is where the flows are proved. What is left over is
   mechanical, and every one of it is something a later screen ticket could
   quietly put back: another card surface, a handle renamed out from under
   the walkthrough, a preference gate collapsed into one condition.

   The list of card surfaces is the reason spec 08 exists. Home could render
   twelve at once.

   What is left here is greps, and deliberately so (ticket 08). A class
   that may not appear, an import that has to be there, a handle the
   walkthrough grips: those are negatives and wirings over a file, and
   there is no call that answers them. The rules Home used to state inline
   are not here any more - the wordmark's swap is
   disguise/identity.test.ts's and the area-to-stripe table is a value this
   file reads, because an assertion that matches source text passes on
   broken behaviour that keeps the string and fails on a correct refactor
   that moves it. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { HOME_AREA_ROLE } from '../src/lib/theme/roles';
import { LIVE_TILE_ORDER } from '../src/lib/data/liveTiles';
import { UNPROMPTED_KINDS } from '../src/lib/unprompted/registry';
import { HUB_ROWS } from '../src/lib/data/hubRows';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

const home = read('src/routes/+page.svelte');
/** The markup half: a string in the script block may be anything. */
const markup = home.replace(/<script[\s\S]*?<\/script>/g, '');
/** Both halves with the prose taken out, for the rules that are about an
    absence: a comment saying what a screen no longer does is not the screen
    still doing it. */
const code = home.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');

describe('what Home is built from', () => {
  it('takes its surfaces from the kit and draws no card of its own', () => {
    /* DIRECTION.md 2b: a screen picks the surfaces its content needs. The
       old vocabulary is `.card` and `.list-group` in components.css, which
       the screen tickets replace one screen at a time - Home is the first,
       so it may not reach for either. Sheets are not a surface: quick log's
       dimension prompt is a sheet the editor navigates into. */
    expect(markup).not.toMatch(/class="[^"]*\bcard\b/);
    expect(markup).not.toMatch(/class="[^"]*\blist-group\b/);
    expect(markup).not.toMatch(/<EmptyState/);
  });

  it('reads its section colours from the shell rather than from the document', () => {
    /* activeFlag.svelte.ts: the shell publishes the flag in the same effect
       that stamps the palette, because a screen reading it for itself races
       that stamp and silently draws the previous palette. */
    expect(home).toContain("from '$lib/theme/activeFlag.svelte'");
    expect(home).not.toContain('readFlagRoles(');
  });

  it('hands each area its own named stripe, and the log strip the one that is always a colour', () => {
    /* Roles run colours-before-shades, so index 0 is the only one guaranteed
       chromatic across all 8 palettes; the log strip's write shapes are icon
       squares of the stripe, and a square of trans's white band on a white
       page is not a control (redesign ticket 13). The rest is wiring: each
       area is handed its own entry rather than a number. */
    expect(HOME_AREA_ROLE.log).toBe(0);
    const log = markup.match(/<div class="home-log"[^>]*>/s)?.[0];
    expect(log).toBeDefined();
    expect(log).toContain('AREA_ROLE.log');
    // A day block is a block, so the agenda resolves through the chromatic
    // roles like a tile (ticket 24): on trans its slot is the white band.
    expect(markup).toContain('tileRoleAt(activeFlag.roles, HOME_AREA_ROLE.agenda)');
    /* And so is a row's icon square, which is why the pinned block resolves
       the same way since redesign ticket 14: on agender the stripe its index
       landed on was the near-white band, so four icon blocks on the light
       theme were white squares on a white page with a hairline round them -
       the exact defect rule 3's revision named for tiles. */
    expect(markup).toContain('tileRoleAt(activeFlag.roles, HOME_AREA_ROLE.pinned)');
    expect(markup).not.toContain('HOME_AREA_ROLE.week');
    expect(markup).not.toContain('HOME_AREA_ROLE.days');
  });

  it('publishes no flag at all under disguise', () => {
    /* ADR-0035 gates the sun on the preference because "a blurred wash was
       deniable at a glance, a crisp flag is not". The section roles are the
       same argument further on - they are the flag's stripes in the flag's
       own order painted down a whole screen - so the shell publishes none of
       it, once, for every screen rather than per screen. */
    const flag = read('src/lib/theme/activeFlag.svelte.ts');
    expect(flag).toMatch(/if \(disguised\) \{/);
    expect(flag).toMatch(/activeFlag\.roles = \[\];/);
    expect(read('src/routes/+layout.svelte')).toContain('refreshActiveFlag(document, prefs.disguise)');
    // And Home still gates the sun itself, which is the belt to that braces.
    expect(markup).toContain('{#if !prefs.disguise}<FlagSun />');
    /* The hero is the largest text on the screen and SCREENS.md says
       disguise changes the app's name app-wide, so it swaps too - but
       both halves of that are disguise/identity.test.ts's now, the rule
       by calling it and the wiring by holding all four naming surfaces to
       reading the module. Asserting it a second time here would be the
       same string in two files. */
  });
});

describe('what spec 08 took off Home', () => {
  it('draws the tally as two shapes of the log strip and nowhere else, and quick add still carries it', () => {
    /* Spec 08 took the two tally buttons off Home and phase 10 (spec story
       12) put the tally back as two of the log strip's write shapes, beside
       the mood pick rather than above it. The fan keeps its own pair. */
    expect((markup.match(/tally_misgendered/g) ?? []).length).toBe(1);
    expect((markup.match(/tally_correctly_gendered/g) ?? []).length).toBe(1);
    expect(markup).toMatch(/data-home-log-shape="tally-misgendered"[\s\S]{0,300}m\.tally_misgendered\(\)/);
    expect(read('src/lib/components/QuickAdd.svelte')).toContain('tally-misgendered');
    expect(read('src/lib/components/QuickAdd.svelte')).toContain('tally-correctly_gendered');
  });

  it('still logs a tally the widget deep-links in', () => {
    /* The buttons left; the landing did not. `/?tally=...` is a route the
       launcher is allowed to open (android/launch-routes.ts), and it is
       Home's to write. */
    expect(home).toContain("searchParams.get('tally')");
    expect(read('src/lib/android/launch-routes.ts')).toMatch(/tally=/);
  });

  it('offers no doubt card, and the More hub has the row instead', () => {
    expect(home).not.toContain("from '$lib/components/DoubtCard.svelte'");
    expect(markup).not.toContain('<DoubtCard');
    expect(HUB_ROWS.map((row) => row.href)).toContain('/doubt');
  });

  it('draws no hrt onset nudge or effects tile on Home (ticket 49: lives in quick add)', () => {
    expect(markup).not.toContain('data-live-tile="effects"');
    expect(markup).not.toContain('data-live-tile="hrt-onset"');
    expect(home).not.toContain('showEffectsTile');
    expect(home).not.toContain('isHrtOnsetWindowCurrent');
    expect(read('src/lib/components/QuickAdd.svelte')).toContain('data-choose="effects"');
    expect(read('src/lib/components/QuickAdd.svelte')).toContain('isHrtOnsetWindowCurrent');
  });

  it('asks one module for the live tiles rather than holding thirteen reads', () => {
    /* Phase 8 deepening ticket 07. This used to match the source of five
       `$derived` lines and eleven `data-live-tile` literals, which is a rule
       stated where it cannot fail honestly: it passes on a broken screen
       that keeps the strings, and fails on a correct move that does not.
       What the gating actually does is liveTiles.grid.test.ts's, through
       `composeHomeTiles`. What is left here is the wiring - that Home asks,
       and does not also answer. */
    expect(home).toContain("from '$lib/data/liveTiles.svelte'");
    expect(home).toContain('homeTiles(today, {');
    for (const read of [
      'j.wearSessions.getRunningSession',
      'j.regimen.getEpisodes',
      'j.procedures.getProcedures',
      'j.letters.getLetters',
      'j.entries.latestBadMomentEntry',
      'j.tryouts.getTryouts',
      'j.doses.getSchedules',
      'j.voiceBenchmarks.getBenchmarks',
      'j.journalingPauses.getPauses',
      'j.hairRemoval.getSessions',
      'j.measurements.getMeasurementsInRange'
    ]) {
      expect(home, `${read} belongs to liveTiles.svelte.ts now`).not.toContain(read);
    }
    // Eleven ternaries counting the tiles are `tiles.length`.
    expect(home).not.toContain('liveTilesCount');
  });

  it('stamps every tile with the registry key the walkthrough grips', () => {
    /* ADR-0029: the handle is the kind's own key, so an added tile cannot
       arrive without one and none of them can be renamed by a copy edit. */
    expect(markup).toContain('data-live-tile={tile.key}');
    // Two blocks since the weights landed - the tile grids (today and
    // moment, one `#snippet` since phase 8 features ticket 63 split today
    // out to its own location above the mood pick) and the quiet list -
    // each keyed on the same field.
    expect((markup.match(/as tile \(tile\.key\)\}/g) ?? []).length).toBe(2);
    for (const kind of LIVE_TILE_ORDER) expect(UNPROMPTED_KINDS).toContain(kind);
  });

  it('declares no tile transition of its own, and leaves through the one primitive', () => {
    /* Deepening ticket 07 got every tile onto one rule; phase 9 carpet
       ticket 04 moved that rule off this screen entirely. Home's own slide
       was on the x axis whatever the layout was doing, so at the 390px floor
       - where this grid is one tile per line - a closing tile shrank its
       width while its neighbours were giving back height. `collapse` rides
       Tile itself and reads the axis off the layout, which makes it the same
       rule for every tile in every grid rather than this screen's guess.

       The blocks Home does still animate are its own: the two tier wrappers
       and getting started, each a block of this screen rather than a kit
       surface, and each on the same `collapse` with the same `skip`. */
    expect(home).not.toContain('tileSlide');
    expect(home).not.toContain("from 'svelte/transition'");
    expect(home).not.toContain('showSurgeryTile || showSafeSpaceTile');
    const rules = markup.match(/transition:collapse=\{panel\}/g) ?? [];
    // The today tier, the agenda, the waiting tiles, the pinned rows, the
    // edit mode that replaces them (redesign ticket 14) and getting started.
    expect(rules.length, 'the screen animates its own blocks and nothing else').toBe(6);
    expect(home).toContain('let panel = $derived({ skip: navigating.to !== null })');
  });

  it('draws the three tiers as three weights, and asks one module for the split', () => {
    /* Phase 8 UX ticket 01. The cap and the ordering are
       liveTiles.grid.test.ts's, through `splitHomeTiles` and
       `composeHomeTiles`; what is Home's is that it draws the answer at
       three weights rather than twelve tiles differing only by hue. */
    expect(home).toContain("from '$lib/data/liveTiles'");
    expect(home).toContain('splitHomeTiles(liveTiles.tiles)');
    /* One table saying what a tier is drawn as, so a tier cannot be given a
       weight in one place and a shape in another. A row, a card, and - for
       dormant, which is not a tile at all - a row of a list. */
    expect(home).toMatch(/tier: 'today', weight: 'row', rows: true/);
    expect(home).toMatch(/tier: 'moment', weight: 'card'/);
    expect(home).toMatch(/tile\.tier === 'dormant'/);
    expect(markup).toContain('weight={block.weight}');
    expect(markup).toContain('data-rows={block.rows}');
    expect(markup).toMatch(/<ListRow[\s\S]*?data-live-tile=\{tile\.key\}/);
  });

  it('folds the overflow in place rather than into a route, and names it', () => {
    /* ADR-0039's amendment: nothing true is suppressed and the fold is not a
       destination. A button, so it announces its state; a link would promise
       a screen that does not exist. */
    const fold = markup.match(/<button[^>]*data-home-tiles-fold[\s\S]*?<\/button>/)?.[0];
    expect(fold, 'the fold is one control').toBeDefined();
    expect(fold).toContain('aria-expanded={tilesExpanded}');
    expect(fold).not.toContain('href');
    expect(home).toContain('m.home_tiles_more(');
    expect(home).toContain('m.home_tiles_fewer()');
  });

  it('counts the whole journal from one narrow read, and says nothing at zero', () => {
    /* Entries and the span, not the recap - which is scoped to a range and
       pays for six queries including two window functions. */
    expect(home).toContain('j.entries.countAll()');
    expect(home).toContain('j.eras.getJournalBounds()');
    expect(home).not.toContain('j.stats.recap');
    // `{#if entryCount && ...}` is the absence at zero, and the `&&` is what
    // also holds the line back until the count has answered.
    expect(markup).toMatch(/\{#if entryCount && journalBoundsQuery\.value\}/);
  });

  it('offers somewhere to start until the journal has five entries, then stops on its own', () => {
    /* Alicja, 2026-09-04. Day one has nothing on it once the placeholders
       are gone, and "write an entry" says nothing about what the app
       becomes. Five rather than one, so it is still there when somebody
       comes back to read it; nothing to dismiss, because it leaves. */
    expect(home).toContain('const GETTING_STARTED_UNTIL = 5');
    expect(home).toMatch(/entryCount != null && entryCount < GETTING_STARTED_UNTIL/);
    expect(markup).toContain('data-getting-started');
    // Every row goes somewhere, and the last hands the inventory to the hub.
    const rows = home.match(/const GETTING_STARTED = \[[\s\S]*?\];/)?.[0] ?? '';
    expect(rows, 'the offers are one list').not.toBe('');
    expect((rows.match(/href: '/g) ?? []).length).toBe(5);
    expect(rows).toContain("href: '/more'");
    // Nothing here may be a dismissable nudge: it is not one of the tiles.
    expect(markup).not.toMatch(/data-getting-started[\s\S]{0,400}dismiss/);
  });

  it('renders the day-one shape with no empty card, no placeholder grid and no skeleton', () => {
    /* Redesign ticket 13: a brand-new journal meets the field, the log
       strip, the default pinned set and getting started. Everything else on
       the screen is gated on data it does not have - the agenda on the
       projection being non-null (absent, never empty: ADR-0074) and the
       tiles on a kind qualifying - so nothing here needs an entry count to
       decide what to hide, and nothing draws a skeleton while it waits.

       The pinned block is the one thing that is always drawn, since redesign
       ticket 14: its last row is the way into the edit mode, and a block
       that disappeared once somebody unpinned everything would take the way
       back with it. What it says changes instead - the edit row asks for the
       first pin where there is nothing to arrange. */
    expect(markup).toMatch(/\{#if agenda\}/);
    expect(markup).toMatch(/data-edit-today/);
    expect(markup).toMatch(/pinned\.length > 0 \? m\.home_pinned_edit\(\) : m\.home_pinned_edit_empty\(\)/);
    expect(home).not.toContain('hasEntries');
    expect(markup).not.toContain('<ReadGate');
    expect(markup).not.toContain('key="no-entries"');
    /* The look-back grid itself left for the Look back door with redesign
       ticket 11 (tests/stats-surfaces.test.ts holds its two gates there). */
    expect(markup).not.toContain('HOME_AREA_ROLE.lookBack');
  });

  it('leads with what is running and what is coming, and asks how you feel after', () => {
    /* The order the ticket exists for: the today tier, the agenda, the
       notices with their dates in their own copy, then the log strip with
       the mood pick in it - never the mood pick first. */
    const at = (needle: string) => {
      const i = markup.indexOf(needle);
      expect(i, needle).toBeGreaterThan(-1);
      return i;
    };
    const today = at('@render tileRow(todayTiles');
    const agenda = at('data-home-agenda');
    const backup = at('data-backup-notice');
    const stock = at('data-stock-notice');
    const debrief = at('data-debrief-offer');
    const log = at('data-home-log');
    const moods = at('<MoodChips');
    const waiting = at('class="home-tiles"');
    const pinned = at('data-home-pinned');
    const start = at('data-getting-started');
    expect(today).toBeLessThan(agenda);
    expect(agenda).toBeLessThan(backup);
    expect(backup).toBeLessThan(stock);
    expect(stock).toBeLessThan(debrief);
    expect(debrief).toBeLessThan(log);
    expect(log).toBeLessThan(moods);
    expect(moods).toBeLessThan(waiting);
    expect(waiting).toBeLessThan(pinned);
    expect(pinned).toBeLessThan(start);
    // And the mood row is inside the log strip, one write shape among the others.
    expect(markup).toMatch(/<div class="home-log"[\s\S]*?<MoodChips[\s\S]*?data-home-log-shape/);
  });

  it('draws the agenda from the one projection and adds no mark, route or word of its own', () => {
    /* ADR-0074: the read is `readAgenda`, the switches sit above it
       (ticket 05), the fold comes back from the projection, and a mark's
       icon and title are the day view's. Disguise is answered inside the
       read, before either fetch runs. */
    expect(home).toContain("from '$lib/data/agendaReads'");
    expect(home).toContain('readAgenda({ dayAhead: j.dayAhead, doses: j.doses }, today, prefs.disguise, shownAgendaKinds(prefs))');
    expect(home).toContain('dayAheadMarkLabel(item.kind)');
    expect(home).toContain('passedSlotSentence(');
    expect(home).not.toContain('DAY_AHEAD_ROUTES');
    expect(home).not.toContain('getDayAhead(');
    expect(home).not.toContain('.sort(');
    const fold = markup.match(/<button[^>]*data-home-agenda-fold[\s\S]*?<\/button>/)?.[0];
    expect(fold, 'the agenda fold is one control').toBeDefined();
    expect(fold).toContain('aria-expanded={agendaExpanded}');
    expect(fold).not.toContain('href');
  });

  it('draws the pinned rows resolved, in the order they were put, and never reorders them', () => {
    /* ADR-0073: one pure resolution over the person's pins, the registry and
       area state, off the same two reads the Transition door makes; the
       words are the hub's own, so a pinned row and its hub row agree. */
    expect(home).toContain("from '$lib/data/pinnedRows'");
    expect(home).toContain('lastWrites: lastWritesQuery.value');
    expect(home).toContain('states: areaStatesQuery.value');
    expect(home).toContain('pinnedRows(prefs, reading)');
    expect(home).toContain('j.lastWrite.getLastWrites(today)');
    expect(home).toContain('j.areaStates.getAreaStates()');
    /* The third read, phase 11 all-four-doors ticket 02: a pinned row draws
       the same line its hub row does, so it asks the same forward question
       rather than a second one of its own. */
    expect(home).toContain('forward: forwardQuery.value');
    expect(home).toContain('readRowForward(j, today)');
    /* The wear row counts up off the tile grid's own clock rather than a
       second interval (ADR-0051). */
    expect(markup).toMatch(/<ListRow[\s\S]*?title=\{hubRowTitle\(row\.spec\.key\)\}[\s\S]*?subtitle=\{hubRowLine\(row\.spec\.key, row\.line, today, liveTiles\.nowMs\)\}[\s\S]*?data-pinned-row=\{row\.spec\.key\}/);
    expect(home).not.toMatch(/pinned[\s\S]{0,200}\.sort\(/);
  });

  it('ticket 106: prevents hydration layout shift by rendering fallback rows immediately and disclosing transitions', () => {
    /* Pinned rows must not fall back to an empty array while queries resolve,
       which would collapse the card and snap content down 300px on resolution.
       Rows animate changes with disclose. */
    expect(home).not.toMatch(/\?\s*pinnedRows\([^)]+\)\s*:\s*\[\]/);
    expect(home).toContain('fallbackReading(today)');
    expect(markup).toContain('class="rows-divide" transition:disclose={panel}');
  });

  it('keeps every write shape the centre fan offers, together, and touches the fan itself not at all', () => {
    /* Spec stories 11 to 13: the mood pick is one shape among the others a
       tap can start, and the fan is unchanged. The strip's shapes are the
       fan's four resolvable targets under the fan's own words; a backdated
       entry needs a date first and stays the fan's sheet. */
    const shapes = [...markup.matchAll(/data-home-log-shape="([^"]+)"/g)].map((m) => m[1]);
    expect(shapes).toEqual(['dose', 'tally-misgendered', 'tally-correctly_gendered', 'wear']);
    const fan = read('src/lib/components/QuickAdd.svelte');
    for (const shape of shapes) expect(fan).toContain(`data-choose="${shape}"`);
    for (const key of ['doses_empty_action', 'tally_misgendered', 'tally_correctly_gendered', 'wear_session_start_action', 'wear_session_stop_action']) {
      expect(home).toContain(`m.${key}()`);
      expect(fan).toContain(`m.${key}()`);
    }
    // The running session is read off the tiles, not asked for again.
    expect(home).toContain("tile.key === 'wear-timer'");
  });

  it('gives the live tiles grid its own role', () => {
    expect(HOME_AREA_ROLE.liveTiles).toBe(1);
    expect(markup).toContain('HOME_AREA_ROLE.liveTiles');
  });

  it('carries neither look-back teaser any more (redesign ticket 11)', () => {
    /* Both offers draw on the Look back door now, each still behind its own
       preference gate; tests/stats-surfaces.test.ts holds the two gates. */
    expect(markup).not.toContain('<WrappedHomeCard');
    expect(markup).not.toContain('<OnThisDayHomeCard');
  });

  it('draws no entries, no week strip and no milestones list, and each is on its own door (redesign ticket 13)', () => {
    /* The four departures, proven route by route rather than by absence
       alone: the week strip and the recent entries on the Journal door, the
       two teasers on the Look back door (the test above), and the
       milestones - list and rail both - on the Transition door.

       The rail was a row on the Look back door between ticket 13 and
       redesign ticket 43, which merged it into the milestones screen. So
       the route it used to be linked at is gone from both screens, and
       what carries it is the registered Transition row. */
    expect(markup).not.toContain('<WeekStrip');
    expect(markup).not.toContain('<DayCard');
    expect(markup).not.toContain('<MilestoneCard');
    expect(home).not.toContain('recentDays(');
    expect(markup).not.toContain('href="/timeline"');
    const calendar = read('src/routes/calendar/+page.svelte');
    expect(calendar).toContain('<WeekStrip');
    expect(calendar).toContain('recentDays(');
    expect(read('src/routes/stats/+page.svelte')).not.toContain('href="/timeline"');
    expect(read('src/routes/transition/milestones/+page.svelte')).toContain('<MilestoneRail');
    expect(HUB_ROWS.map((row) => row.href)).toContain('/transition/milestones');
  });

  it('computes no run of consecutive days, and names none', () => {
    /* Phase 8 UX ticket 01, ADR-0055: the streak is gone from all six of its
       readers, and Home held two of its four defusal surfaces. A grep,
       because what has to hold is an absence - over the code rather than the
       whole file, since the comments still say what used to be here and why
       it left. */
    expect(code, 'nothing reads it and nothing draws it').not.toMatch(/streak/i);
  });

  it('throws its one extra moment once, on a milestone day', () => {
    /* The one authored moment besides the sun. Tier 4 rules out a second
       ambient *loop*, not a moment - so what matters is that this one ends,
       and that it fires on a rare day rather than most mornings. */
    expect(home).toMatch(/\{#if celebrate\}/);
    // The animation moved into this file's own <style> block (phase 5 audit
    // ticket 16), so `home` is read here rather than screens.css.
    expect(home).toMatch(/animation: cheer-fall[^;]*;/);
    expect(home.match(/animation: cheer-fall[^;]*;/)?.[0], 'plays once').not.toMatch(/infinite/);
    // Substituted, not clamped, under both reduced-motion paths.
    expect(home).toContain(":global(html[data-a11y-motion='reduce']) .home-cheer i { animation: none; }");
    expect(home).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.home-cheer i \{ animation: none; \}/);
  });
});

describe('the handles the walkthrough grips', () => {
  /* ADR-0029. Every one of these names a capability that survived the
     rebuild, so every one of them has to survive it too - a rebuild is
     exactly when a handle goes missing, and `waitForSelector` against
     nothing fails thirty seconds later with no name for what went. */
  const ON_HOME = [
    'data-home-header',
    'data-home-hero',
    'data-home-hello',
    'data-home-agenda',
    'data-agenda-item',
    'data-home-agenda-fold',
    'data-home-log',
    'data-home-log-shape',
    'data-home-pinned',
    'data-pinned-row',
    'data-backup-notice',
    'data-quick-log-dims',
    'data-qld-input',
    'data-qld-add',
    'data-qld-skip'
  ];

  it.each(ON_HOME)('keeps %s on Home', (handle) => {
    expect(markup).toContain(handle);
  });

  it('keeps the two look-back offers findable by what they offer', () => {
    expect(read('src/lib/components/WrappedHomeCard.svelte')).toContain('data-wrapped-card');
    expect(read('src/lib/components/OnThisDayHomeCard.svelte')).toContain('data-on-this-day-card');
  });

  it('calls a mood option the same thing wherever it is drawn', () => {
    /* The chip row and the editor's picker are two components and one
       concept. A second handle for it would make the walkthrough's real
       interface "whichever of the two this screen chose". */
    expect(read('src/lib/components/kit/MoodChips.svelte')).toContain('data-mood={step}');
    expect(read('src/lib/components/MoodPicker.svelte')).toContain('data-mood={mood.value}');
  });

  it('calls an entry the same thing on a day card as on a list', () => {
    expect(read('src/lib/components/kit/DayEntry.svelte')).toContain('data-entry-card=');
    expect(read('src/lib/components/kit/DayEntry.svelte')).toContain('data-entry-note');
    expect(read('src/lib/components/EntryCard.svelte')).toContain('data-entry-card');
    expect(read('src/lib/components/EntryCard.svelte')).toContain('data-entry-note');
  });
});
