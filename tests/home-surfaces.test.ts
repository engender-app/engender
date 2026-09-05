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

  it('gives the week strip the one role that is always a colour', () => {
    /* Roles run colours-before-shades, so index 0 is the only one guaranteed
       chromatic across all 8 palettes, and the strip is the one area here
       where the stripe is a value rather than a decoration. On trans, whose
       flag yields three roles for four areas, reading order handed the strip
       the white band. */
    expect(HOME_AREA_ROLE.week).toBe(0);
    /* The rest is a grep because it is about wiring: that the strip is
       handed that area's role rather than another's. */
    const strip = markup.match(/<WeekStrip[^>]*>/s)?.[0];
    expect(strip).toBeDefined();
    expect(strip).toContain('AREA_ROLE.week');
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
  it('draws no tally buttons, which quick add carries', () => {
    expect(markup).not.toContain('tally_misgendered');
    expect(markup).not.toContain('tally_correctly_gendered');
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
    // Three blocks since phase 8 features ticket 63 split the today weight
    // out to its own location above the mood pick: the today grid, the
    // moment grid, and the quiet list - each keyed on the same field.
    expect((markup.match(/as tile \(tile\.key\)\}/g) ?? []).length).toBe(3);
    for (const kind of LIVE_TILE_ORDER) expect(UNPROMPTED_KINDS).toContain(kind);
  });

  it('gives every tile the same slide-in rule', () => {
    /* The bug deepening ticket 07 fixed: seven tiles asked `liveTilesCount >
       1` and four asked a hand-written disjunction of only the original
       five, so a journal showing the wear and measurements tiles slid one in
       and let the other appear. Two occurrences since phase 8 features
       ticket 63 moved the today grid above the mood pick - one per weight
       that still renders a grid - and the rule is written the same way in
       both, over what is on screen rather than over one grid's own
       length. */
    const rules = markup.match(/transition:tileSlide=\{\{[^}]*\}\}/g) ?? [];
    expect(rules.length, 'said once for every weight, not once per tile').toBe(2);
    for (const rule of rules) expect(rule).toBe('transition:tileSlide={{ enabled: shownTiles.length > 1 }}');
    expect(home).not.toContain('showSurgeryTile || showSafeSpaceTile');
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

  it('makes day one wait for the first entry, on a count rather than on a guess', () => {
    /* The week strip's seven grey cells, the milestones empty row and the
       zero-height look-back grid were three of the four unfinished things a
       first-run Home used to show. `hasEntries` is null until the count
       answers, so not-yet-known never paints as none. */
    expect(home).toMatch(/hasEntries = \$derived\(entryCount == null \? null : entryCount > 0\)/);
    expect(markup).toMatch(/\{#if hasEntries\}\s*<TileGrid[\s\S]*?HOME_AREA_ROLE\.lookBack/);
    expect(markup).toMatch(/\{#if hasEntries \|\| upcoming\.length\}/);
    expect(markup).toMatch(/\{#if hasEntries\}\s*<SectionHeading text=\{m\.last_seven\(\)\}/);
    // The one thing day one keeps besides the header and the chips.
    expect(markup).toContain('key="no-entries"');
  });

  it('gives the live tiles grid its own role', () => {
    expect(HOME_AREA_ROLE.liveTiles).toBe(1);
    expect(markup).toContain('HOME_AREA_ROLE.liveTiles');
  });

  it('gates the two look-back halves separately', () => {
    /* The acceptance box: turning wrapped off silences its own half and only
       its own. Two conditions on two preferences, each unmounting its own
       component - and therefore its own query - rather than one condition
       over a merged card. */
    expect(markup).toMatch(/\{#if prefs\.wrappedEnabled\}\s*<WrappedHomeCard \/>/);
    expect(markup).toMatch(/\{#if prefs\.onThisDayEnabled\}\s*<OnThisDayHomeCard \/>/);
  });

  it('caps what it draws without narrowing what it reads', () => {
    /* The cap is a render limit: the day bar has to be able to say how many
       entries a day holds, which a query row limit would make
       unanswerable. */
    expect(home).toContain('RECENT_ENTRY_CAP');
    expect(home).toContain('recentDays(RECENT_DAYS)');
    expect(markup).toContain('href="/calendar"');
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
