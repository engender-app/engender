/* The Look back door and its readings (phase 8 UX ticket 03's emptiness
   rule, ADR-0056; redesign ticket 11's rail; phase 11 ticket 07's tile
   grid). The two interval folds this file used to hold left for /care
   whole (redesign ticket 05); their describe block went with them, to
   tests/care-surfaces.test.ts.

   Greps by design (ticket 08): every one of these is a Svelte template fact
   - which branch a panel is inside, what order the door draws in - rather
   than a function with an answer to call. The rule the file has to satisfy
   is that nothing on this door renders for a practice the person has never
   done, that one span drives every read, and that the door is a set of
   readings each opening its own screen - and a template can only be held to
   that by reading it. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { READINGS } from '../src/lib/data/lookBackReadings.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');
const stats = read('src/routes/stats/+page.svelte');
const route = read('src/routes/stats/[reading]/+page.svelte');
/* The rail is its own component, and three of this door's own rules live
   in it rather than on the page (ticket 06). */
const timeline = read('src/lib/components/SpanTimeline.svelte');
const readings = {
  dayByDay: read('src/lib/components/readings/DayByDayReading.svelte'),
  plane: read('src/lib/components/readings/PlaneReading.svelte'),
  days: read('src/lib/components/readings/DaysReading.svelte'),
  tags: read('src/lib/components/readings/TagsReading.svelte'),
  bodyMap: read('src/lib/components/readings/BodyMapTile.svelte'),
  compare: read('src/lib/components/readings/CompareTile.svelte'),
  cost: read('src/lib/components/readings/CostReading.svelte')
};
const markup = (source: string) =>
  source
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');

describe('the summary panels wait for the floor', () => {
  /* WRAPPED_ENTRY_FLOOR, read off the module that owns it rather than
     written here as a 5 - ADR-0056's "no new magic numbers". The door reads
     it once and hands the answer to the readings that hold to it. */
  it('reads its floor from the module that owns it, once, on the door and on the route', () => {
    for (const source of [stats, route]) {
      expect(source).toContain("import { WRAPPED_ENTRY_FLOOR } from '$lib/data/wrapped'");
      expect(source).not.toMatch(/>= 5\b/);
    }
    expect(stats).toContain('let enoughEntries = $derived(entryCount >= WRAPPED_ENTRY_FLOOR);');
    for (const key of ['dayByDay', 'days', 'tags'] as const) {
      expect(readings[key], key).toMatch(/enoughEntries\s*=\s*true/);
      expect(readings[key], key).not.toMatch(/import \{[^}]*WRAPPED_ENTRY_FLOOR/);
    }
  });

  it('draws no scale bars under the floor', () => {
    expect(readings.dayByDay).toMatch(/\{:else if enoughEntries\}\s*<BarRows rows=\{scaleRows\} measure="track" \/>/);
  });

  it('draws no mood strip under the floor', () => {
    expect(readings.days).toMatch(/\{#if !moodQuery\.loading && enoughEntries && anyDays\}\s*<ChartCard[^>]*>\s*<OrderedStrip\s+steps=\{moodSteps\}/);
  });

  /* Cards hand BarRows a position between 0 and 1 in something's own
     range, and the primitive re-normalised them against their own longest
     bar until ticket 11 gave it a `scale`. */
  it('asks for the track where the bar is an absolute position', () => {
    expect(readings.dayByDay).toMatch(/<BarRows\s+rows=\{scaleRows\}[^>]*measure="track"/);
  });

  it('stops offering a second scale on a chart with no first one', () => {
    expect(readings.dayByDay).toContain('{#if withData.length > 1 && plotted.points.length}');
  });

  /* The sheet and the link that opened it went in ticket 99 item 26. The
     gate did not: the series is still written out for a screen reader, and
     an empty list under an empty chart would be as wrong as an empty sheet
     was. tests/accessibility-audit.test.ts holds the other half. */
  it('writes the values out only where there are values', () => {
    expect(readings.dayByDay).toMatch(/\{#if valueRows\.length\}\s*<ul class="visually-hidden" data-values-list/);
  });
});

/* The area index - a row per area in the More hub's own four groups - was
   removed by ticket 99 item 36. What survives it is the rule the index was
   held to, which outlives the block itself. */
describe('the stats tab keeps out of the areas' + "'" + ' business', () => {
  it('asks for no per-area read at all', () => {
    for (const call of ['getMeasurementsInRange', 'getMostRecentAnalyte', 'weeklyWearHours']) {
      expect(stats).not.toContain(call);
    }
  });
});

/* Redesign ticket 11: the door leads with the person's history, and one
   span drives every read on it. Phase 11 ticket 07: under the facts, the
   door is a grid of readings and a resurfacing block, and nothing else. */
describe('the Look back door leads with the rail, and the span is the range', () => {
  it('opens on the title, the rail, the facts, the grid, then the resurfacing pair', () => {
    const body = markup(stats);
    const header = body.indexOf('<ScreenHeader title={m.nav_lookback()}');
    const rail = body.indexOf('<SpanTimeline');
    const facts = body.indexOf('data-lookback-fact');
    const grid = body.indexOf('<ReadingGrid');
    const pair = body.indexOf('<TileGrid');
    expect(header).toBeGreaterThan(-1);
    expect(rail).toBeGreaterThan(header);
    expect(facts).toBeGreaterThan(rail);
    expect(grid).toBeGreaterThan(facts);
    expect(pair).toBeGreaterThan(grid);
  });


  /* Nothing else: no card drawn in full, no section heading, no list of
     deeper readings, no journey caption. Every reading is a tile. */
  it('draws no card and no list on the door itself', () => {
    const body = markup(stats);
    for (const gone of ['<ChartCard', '<SectionHeading', '<AreaChart', '<PairedDots', '<OrderedStrip', '<Donut', 'stats-caption', 'key="body-map"', 'key="compare"']) {
      expect(body, gone).not.toContain(gone);
    }
    expect(stats).not.toContain('stats_group_cross');
    expect(stats).not.toContain('stats_look_back');
  });

  /* Ticket 06: the line naming the span used to be the header's subtitle,
     two elements above the rail it is a reading of. The rail owns it now. */
  it('writes the span under the rail rather than under the title', () => {
    expect(stats).not.toContain('subtitle={spanLabel}');
    expect(timeline).toContain('data-span-state-line');
    expect(timeline.indexOf('data-span-state-line')).toBeGreaterThan(timeline.indexOf('class="span-tl-rail"'));
  });

  it('reads the rest of the history through the annotations query, over the whole rail', () => {
    expect(stats).toContain('j.chartAnnotations.getAnnotations(start, today, today)');
    expect(stats).toContain('historyBands(railAnnotationsQuery.rows)');
    expect(stats).toContain('surgeryMarks(railAnnotationsQuery.rows)');
  });

  /* Colour on the rail means an era and nothing else: the history rows are
     ink, one solid and one hollow. */
  it('names only the kinds present, and asks the flag for nothing but the eras', () => {
    expect(timeline).toContain('railLegendKinds(history, marks, surgeries, bands.length > 0)');
    expect(timeline).toMatch(/\.span-tl-hband\[data-span-band='regimen'\] \{[^}]*background: var\(--text-2\);/);
    expect(timeline).toMatch(
      /\.span-tl-hband\[data-span-band='tryout'\] \{[^}]*background: var\(--bg\);\s*border-color: var\(--text-2\);/
    );
    expect(timeline).not.toMatch(/span-tl-hband[\s\S]{0,400}--role-draw/);
  });

  it('shows the drag hint once per journal and lets the first move answer it', () => {
    expect(stats).toContain('hintSeen={prefs.spanRailHintDismissed}');
    expect(stats).toContain('onHintSeen={() => (prefs.spanRailHintDismissed = true)}');
    expect(timeline).toContain('class:is-hidden={!showHint}');
    /* A milestone tap commits without touching a handle. */
    expect((timeline.match(/answerHint\(\);/g) ?? []).length).toBe(3);
  });

  /* Release audit U14: on the rail, the hint sat over the lanes at rest.
     It is a line under the rail's reading now, faded where it stands and
     latched for the visit, so answering it moves nothing under it. */
  it('puts the hint under the rail, and fades it without taking its line away', () => {
    const rail = timeline.slice(timeline.indexOf('class="span-tl-rail"'), timeline.indexOf('data-span-state-line'));
    expect(rail).not.toContain('data-span-hint');
    expect(timeline).toMatch(/\{#if hintDrawn\}\s*<p class="span-tl-hint" class:is-hidden=\{!showHint\}/);
    expect(timeline).not.toContain('--tl-hint-x');
  });

  it('crossfades the written span instead of cutting it, with the day count riding along', () => {
    expect(timeline).toContain("import { crossfade } from '$lib/motion/reveal';");
    expect(timeline).toMatch(
      /\{#key spanDates\}<span class="span-tl-reading" out:crossfade use:dateFadeIn>\{spanDates\}\{`, \$\{m\.n_days\(\{ n: shownDays \}\)\}`\}/
    );
    expect(timeline).not.toMatch(/transition:dateFade/);
  });

  /* Functional audit ticket 12: one way into Wrapped, the gated tile in the
     resurfacing pair. The quick picks are gone, and no address on the door
     names a cadence of its own. */
  it('reaches Wrapped through the tile alone', () => {
    expect(stats).not.toContain("'/wrapped/");
    expect(stats).not.toContain('key="lookback-quick"');
    expect(stats).not.toContain('/wrapped/range');
  });

  /* Wrapped's second line is always mood; this one is deliberately not, so
     the door's first number is never a scale nobody keeps. The door reads
     the active scale's own series for it - it no longer reads every
     scale's, that card is the day-by-day reading's now. */
  it('shows the active scale\'s average, not always mood, off one series', () => {
    expect(stats).toContain('j.stats.dayAverages(shown.key, from, to)');
    expect(stats).toContain('averageLabel(shown)');
    expect(stats).not.toContain('metrics.map((mt) => mt.key)');
  });

  it('reads the facts off one query, so every row changes in the same flush', () => {
    expect(stats).toContain("import { recapDimChange } from '$lib/data/recapDisplay';");
    expect(stats).toMatch(/liveQuery\(async \(j\) => \{[\s\S]*j\.stats\.recap\(from, to\)[\s\S]*j\.stats\.dayAverages\(shown\.key, from, to\)[\s\S]*\}\)/);
    expect(stats).toContain('let dimChange = $derived(factsQuery.value ? recapDimChange(factsQuery.value.recap) : null);');
    expect(stats).toContain('{m.wrapped_scale_arc()}');
  });

  it('draws no facts under the floor, where the thin-body line already says why', () => {
    expect(stats).toMatch(/\{#if enoughEntries\}\s*<div class="screen-part">\s*<div data-lookback-facts transition:collapse/);
  });

  /* ux-carpet ticket 255: the facts answered within the screen's own arrival
     window and popped in at full opacity, shoving the quick picks below by
     94-184px in one frame - nothing held their room. `ReadReserve` is the
     standing fix for a late-arriving block (ticket 183/193/205/211): hold
     last visit's height, fade the answer in over it, let any guess error
     travel rather than jump. */
  it('holds the facts\' room and fades the read in, rather than popping at full opacity', () => {
    expect(stats).toContain("import ReadReserve from '$lib/components/kit/ReadReserve.svelte';");
    expect(stats).toContain("import { readReserve, rememberReserve } from '$lib/data/homeReserve';");
    expect(stats).toContain('let factsAnswered = $derived(!factsQuery.loading && vocabulary.ready);');
    expect(stats).toMatch(/let factsRevealed = \$state\(false\);\s*\$effect\.pre\(\(\) => \{\s*if \(factsAnswered\) factsRevealed = true;\s*\}\);/);
    expect(stats).toContain('<ReadGroup answered={factsAnswered && factsCurrent} count={2}>');
    expect(stats).toContain("readReserve('lookback-facts')");
    expect(stats).toContain("rememberReserve('lookback-facts'");
    expect(stats).toMatch(/<ReadReserve ready=\{factsRevealed\} estimate=\{factsEstimate\} onrest=\{factsRemember\}>\s*\{#if enoughEntries\}/);
    /* The `{#if}` must gate ReadReserve's only child, not just its content:
       a permanent wrapper div rendered whether or not there are facts to
       show would always give `.read-reserve-body` an element child, so
       ReadReserve's own `:has(> .read-reserve-body > :global(*))` check
       (ReadReserve.svelte) could never read "empty" - the screen would
       lose its default bottom margin below the reserve in exactly the
       no-facts case this ticket says should stay untouched. */
    expect(stats).not.toMatch(/<ReadReserve ready=\{factsRevealed\}[^>]*>\s*<div class="screen-part">\s*\{#if enoughEntries\}/);
  });

  /* ux-carpet 234, item 2: the average and scale-arc rows used to gate their
     own `transition:collapse` on the live `activeAverage`/`dimChange`, which
     flips false in the same reactive flush as `enoughEntries` when a span
     narrows under the floor - so a row's own collapse ran concurrently with
     the card's, and the two read as sliding into each other. `closingFacts`
     only updates while the card is staying open, so the rows show what they
     last held for the whole of the card's own exit and never see their own
     condition flip mid-collapse. */
  it('freezes the two optional rows while the card itself is closing', () => {
    expect(stats).toMatch(/\$effect\.pre\(\(\) => \{\s*if \(enoughEntries\) closingFacts = \{ activeAverage, dimChange \};\s*\}\);/);
    expect(stats).toContain('{#if closingFacts.activeAverage}');
    expect(stats).toContain('{#if closingFacts.dimChange}');
    expect(stats).toContain('{@const dimChange = closingFacts.dimChange}');
    /* The live derived values still drive `closingFacts` and the always-shown
       Entries row, but the two conditionally-removed rows never read them
       directly - that would put their `{#if}` back on the same flush as the
       card's own. */
    expect(stats).not.toMatch(/\{#if activeAverage\}/);
    expect(stats).not.toMatch(/\{#if dimChange\}/);
  });

  it('gates the two look-back teasers separately, the way Home did', () => {
    expect(stats).toMatch(/\{#if surfaceOn\(prefs\.surfaceOverrides, 'wrapped'\)\}\s*<WrappedHomeCard \/>/);
    expect(stats).toMatch(/\{#if surfaceOn\(prefs\.surfaceOverrides, 'on-this-day'\)\}\s*<OnThisDayHomeCard/);
  });

  it('waits for the rail and has a day-one shape', () => {
    expect(stats).toContain('if (railReleased()) railRevealed = true');
    expect(stats).toMatch(/\{#if !railRevealed\}\s*<div out:crossfade data-lookback-rail-wait><Skeleton/);
    expect(stats).toMatch(/\{:else if railStart === null\}\s*<Notice icon="stats" key="lookback-empty"/);
  });

  it('fades in what replaced the rail within the tab arrival, or holds it through the arrival', () => {
    /* A rail answering late in an Android tab change used to fade for a
       full --dur-fast after the field had stopped, and then was squeezed
       into what was left of the travel (tile-arrival-timing). */
    expect(stats).toContain('const railReleased = holdForArrival(() => !railLoading, () => railPainted);');
    expect(stats).toContain("const duration = readRevealDuration('--dur-fast');");
    expect(stats).toContain('playAfterPaint(screen, animations, { fitArrival: true });');
  });
});

/* Phase 11 ticket 07: every reading is a tile stating one figure for the
   span and opening a screen at that span; a reading with no data in the
   span has no tile; the door and the screen draw one component. */
describe('the readings are tiles, each opening its own screen at the span', () => {
  it('draws every reading on the door in tile view, in the ticket\'s order, handed the resolved span', () => {
    const body = markup(stats);
    const order = [
      '<DayByDayReading span={resolvedSpan}',
      '<PlaneReading span={resolvedSpan}',
      '<TagsReading span={resolvedSpan}',
      '<BodyMapTile span={resolvedSpan}',
      '<CompareTile span={resolvedSpan}',
      '<CostReading span={resolvedSpan}'
    ];
    let last = body.indexOf('<ReadingGrid');
    for (const tag of order) {
      const at = body.indexOf(tag);
      expect(at, tag).toBeGreaterThan(last);
      last = at;
    }
    expect((body.match(/view="tile"/g) ?? []).length).toBe(4);
    for (const gone of ['WordsReading', 'HighestReading', 'ThemesReading']) expect(stats).not.toContain(gone);
  });

  it('opens each reading at /stats/<reading> carrying the span, through one address rule', () => {
    for (const key of ['dayByDay', 'plane', 'tags', 'cost'] as const) {
      expect(readings[key], key).toMatch(/href=\{readingHref\('[a-z-]+', span\)\}/);
    }
    expect(readings.bodyMap).toContain('href={`/body-map${spanRangeQuery(span)}`}');
    expect(readings.compare).toContain('href={`/compare${spanRangeQuery(span)}`}');
  });

  it('has a tile only where the span holds data for it', () => {
    expect(readings.dayByDay).toMatch(/\{#if !seriesQuery\.loading && plotted\.points\.length\}\s*<ReadingTile/);
    expect(readings.plane).toMatch(/\{#if canPlot && !constellationQuery\.loading && points\.length\}\s*<ReadingTile/);
    expect(readings.tags).toMatch(/\{#if !correlationCardsQuery\.loading && topCard\}\s*<ReadingTile/);
    expect(readings.bodyMap).toMatch(/\{#if !mapQuery\.loading && region\}\s*<ReadingTile/);
    expect(readings.compare).toMatch(/\{#if !short\}\s*<ReadingTile/);
    expect(readings.cost).toMatch(/\{#if !costsQuery\.loading && first\}\s*<ReadingTile/);
  });

  /* The plane's tile is its drawing (Alicja on the spike: "drop the title -
     just show the small header and a bigger graph"). */
  it('gives the plane\'s tile no headline and every other tile one', () => {
    const planeTile = markup(readings.plane).match(/<ReadingTile[\s\S]*?>/)?.[0] ?? '';
    expect(planeTile).not.toContain('headline=');
    for (const key of ['dayByDay', 'tags', 'bodyMap', 'compare', 'cost'] as const) {
      const tile = markup(readings[key]).match(/<ReadingTile[\s\S]*?>/)?.[0] ?? '';
      expect(tile, key).toContain('headline=');
    }
  });

  it('reads every ranged reading over the span, not over today', () => {
    expect(readings.dayByDay).toContain('j.stats.dayAverages(key, rangeFrom, rangeTo)');
    expect(readings.dayByDay).toContain('j.stats.daySpread(shown.key, from, to)');
    expect(readings.days).toContain("j.stats.dayAverages('mood', from, to)");
    expect(readings.days).not.toContain('tagShare');
    expect(readings.tags).toContain('j.correlationCards.getCards(start, end)');
    expect(readings.tags).toContain("j.stats.tagShare(from, to, { goodDays: days === 'good' })");
    expect(readings.bodyMap).toContain('j.stats.bodyRegionMap(from, to)');
    expect(readings.plane).toContain('j.stats.constellationReadings(x, y, from, to)');
    for (const source of Object.values(readings)) expect(source).not.toMatch(/\(from, today\)/);
  });

  it('has one route for the three readings, which reads the span back and refuses a key it does not know', () => {
    // Every reading has a title on the route: quoted where the key has a
    // hyphen, bare where it does not.
    for (const key of READINGS) expect(route, key).toMatch(new RegExp(`(?:'${key}'|\\b${key}): \\(\\) =>`));
    expect(route).toContain('spanFromSearch(page.url.searchParams, today)');
    expect(route).toContain("isReading(key) ? key : null");
    expect(route).toMatch(/\{#if !reading\}\s*<Notice/);
    expect(route).toContain('back="/stats"');
  });

  /* The constellation's screen carries the scrub and the play control: the
     chart it draws is the one that has them. */
  it('draws the constellation on its screen with its two axis pickers', () => {
    expect(readings.plane).toContain('<GenderConstellationChart');
    expect(readings.plane).toContain('key="constellation-x"');
    expect(readings.plane).toContain('key="constellation-y"');
  });
});

/* Ticket 20: the tag card is one section per scale, each row a bar out of a
   zero line (redesign ticket 05 drew it as paired dots on one list). */
describe('the tag card draws one section per scale as diverging bars', () => {
  it('feeds DivergingBars per scale group, not PairedDots or BarRows', () => {
    expect(readings.tags).toContain('<DivergingBars');
    expect(readings.tags).toContain('{#each groups as group, g (group.metric)}');
    expect(readings.tags).not.toContain('PairedDots');
    expect(readings.tags).not.toContain('<BarRows');
    expect(readings.tags).not.toContain('kind="tag-insights"');
    expect(readings.tags).not.toContain('kind="correlations"');
  });

  it('says what is compared once, at the top of the card, and keeps the note under the rows', () => {
    const card = readings.tags.slice(readings.tags.indexOf('kind="tags-moved"'), readings.tags.indexOf('kind="tag-share"'));
    expect((card.match(/m\.reading_tag_key\(\)/g) ?? []).length).toBe(1);
    expect(card.indexOf('m.reading_tag_key()')).toBeLessThan(card.indexOf('<DivergingBars'));
    expect(card.indexOf('<DivergingBars')).toBeLessThan(card.indexOf('m.insights_note()'));
  });

  it('still opens the entries sheet for a tag row, and skips the dose-day row', () => {
    expect(readings.tags).toMatch(/const pickCorrelationRow = \(key: string\) => \{[\s\S]{0,200}occurrence\.kind === 'tag'/);
  });
  /* After-release 27 (audit L06-06): the ranking spans every scale and
     never read a picked metric, so the picker that sat on it changed
     nothing on the card. The one picker in the file since functional audit
     ticket 12 is the share ring's days filter, on its own card. */
  it('carries no metric picker, since every scale has its own section', () => {
    const ranking = readings.tags.slice(readings.tags.indexOf('kind="tags-moved"'), readings.tags.indexOf('kind="tag-share"'));
    expect(ranking).toContain('<DivergingBars');
    expect(ranking).not.toContain('<ChartPicker');
    expect((readings.tags.match(/<ChartPicker/g) ?? []).length).toBe(1);
    expect(readings.tags).not.toContain('selectMetric');
  });

  /* A span change crossfades the old figure while the card resizes, as the
     share ring does: the figure is keyed on the span its answer was read
     for, and an answer with nothing to compare empties inside the swap. */
  it('swaps the figure on the answer, so a span change crossfades instead of cutting', () => {
    expect(readings.tags).toContain('{#key `${answered[0].start}-${answered[0].end}`}');
    expect(readings.tags).toMatch(/<div in:figureIn out:figureOut data-tag-scales>/);
  });
});

/* Phase 11 ticket 07: the on-this-day tile opens in place, and the route it
   used to open still renders the same block for the notification deep link
   (ADR-0028). */
describe('the resurfacing block', () => {
  it('opens the day under the pair without leaving the door, and keeps the route on the same block', () => {
    expect(stats).toMatch(/onOpen=\{\(event\) => \{\s*event\.preventDefault\(\);\s*dayOpen = !dayOpen;/);
    expect(stats).toMatch(/\{#if dayOpen && surfaceOn\(prefs\.surfaceOverrides, 'on-this-day'\)\}\s*<div class="lookback-day" id="lookback-day" data-lookback-day transition:disclose[^>]*>\s*<OnThisDayBlock \/>/);
    const onThisDay = read('src/routes/on-this-day/+page.svelte');
    expect(onThisDay).toContain('<OnThisDayBlock {scrollTo} />');
    expect(onThisDay).toContain("page.url.searchParams.get('lookback')");
    const block = read('src/lib/components/OnThisDayBlock.svelte');
    expect(block).toContain('data-lookback={d.key}');
    expect(block).toContain('data-lookback-open={d.key}');
  });
});

/* Functional audit ticket 12. The constellation's own rendered check is in
   tests/browser-tier/look-back-surfaces.test.ts; these hold the template
   facts beside it. */
describe('Look back says each thing once', () => {
  it('plots the constellation without asking for a mode', () => {
    expect(readings.plane).not.toContain('vocabulary.presentations.length');
    expect(readings.plane).toContain('let canPlot = $derived(xScale !== undefined && yScale !== undefined);');
  });

  it('keeps the dose-day row in the tag ranking', () => {
    expect(readings.tags).toContain("card.occurrence.kind === 'doseDay'");
    expect(readings.tags).toContain('m.correlation_card_dose_day()');
  });

  it('draws the share ring on Tags with its days filter, and not on the days reading', () => {
    expect(readings.tags).toContain('kind="tag-share"');
    expect(readings.tags).toContain('key="tag-share-days"');
    expect(readings.days).not.toContain('<Donut');
  });

  /* Alicja's sign-off on the ticket: the mood strip was one chart behind
     a tile of its own, and "if it's just a single chart, it should display
     a screen before". It draws on the door over the grid, in the tiles'
     own read group (over, since a leaving grid folds out of flow and a
     strip under it jumped up), and has no tile, no screen and no title on the route. */
  it('draws the mood strip on the door, with no tile and no screen of its own', () => {
    const body = markup(stats);
    expect(body).toMatch(/<ReadGroup[^>]*>\s*<DaysReading span=\{resolvedSpan\} \{enoughEntries\} \/>\s*<ReadingGrid/);
    expect(readings.days).not.toContain('ReadingTile');
    expect(readings.days).not.toContain('readingHref');
    expect(route).not.toContain('DaysReading');
    expect(READINGS).not.toContain('days');
  });

  it('drops the Settings row for the ignored words', () => {
    const settings = read('src/routes/settings/+page.svelte');
    expect(settings).not.toContain('/settings/words');
  });
});
