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
  words: read('src/lib/components/WordsReading.svelte'),
  tags: read('src/lib/components/readings/TagsReading.svelte'),
  highest: read('src/lib/components/readings/HighestReading.svelte'),
  themes: read('src/lib/components/readings/ThemesReading.svelte'),
  bodyMap: read('src/lib/components/readings/BodyMapTile.svelte'),
  compare: read('src/lib/components/readings/CompareTile.svelte')
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
    for (const key of ['dayByDay', 'days', 'highest'] as const) {
      expect(readings[key], key).toMatch(/enoughEntries\s*=\s*true/);
      expect(readings[key], key).not.toMatch(/import \{[^}]*WRAPPED_ENTRY_FLOOR/);
    }
  });

  it('draws no scale bars under the floor', () => {
    expect(readings.dayByDay).toMatch(/\{:else if enoughEntries\}\s*<BarRows rows=\{scaleRows\} measure="track" \/>/);
  });

  it('draws no mood strip under the floor', () => {
    expect(readings.days).toMatch(/\{:else if enoughEntries\}\s*<OrderedStrip steps=\{moodSteps\} \/>/);
  });

  /* Three cards hand BarRows a position between 0 and 1 in something's own
     range, and the primitive re-normalised all three against their own
     longest bar until ticket 11 gave it a `scale`. */
  it('asks for the track where the bar is an absolute position', () => {
    expect(readings.dayByDay).toMatch(/<BarRows\s+rows=\{scaleRows\}[^>]*measure="track"/);
    expect(readings.highest).toMatch(/<BarRows\s+rows=\{highestRows\}[^>]*measure="track"/);
  });

  it('stops offering a second scale on a chart with no first one', () => {
    expect(readings.dayByDay).toContain('{#if metrics.length > 1 && plotted.points.length}');
  });

  /* The sheet and the link that opened it went in ticket 99 item 26. The
     gate did not: the series is still written out for a screen reader, and
     an empty list under an empty chart would be as wrong as an empty sheet
     was. tests/accessibility-audit.test.ts holds the other half. */
  it('writes the values out only where there are values', () => {
    expect(readings.dayByDay).toMatch(/\{#if valueRows\.length\}\s*<ul class="visually-hidden" data-values-list/);
  });

  /* The chooser writes the card's own state and not the stored metric
     preference two other screens shade by, and no ranking is drawn before
     the journal clears the entry floor (phase 9 carpet ticket 11). */
  it('ranks by the chooser, over the floor, without touching the stored metric', () => {
    expect(readings.highest).toMatch(/highestMetricKey\(highestKey,/);
    expect(readings.highest).toMatch(/key="highest-metric"[\s\S]*?onPick=\{\(value\) => \(highestKey = value\)\}/);
    expect(readings.highest).toMatch(/\{:else if enoughEntries && highestRows\.length\}\s*<BarRows\s+rows=\{highestRows\}/);
    expect(readings.highest).not.toContain('selectMetric(');
  });
});

/* The area index - a row per area in the More hub's own four groups - was
   removed by ticket 99 item 36. What survives it is the rule the index was
   held to, which outlives the block itself. */
describe('the stats tab keeps out of the areas' + "'" + ' business', () => {
  it('asks for no per-area read at all', () => {
    for (const call of ['getMeasurementsInRange', 'getMostRecentAnalyte', 'wearTimeTrend', 'tallyTrend']) {
      expect(stats).not.toContain(call);
    }
  });
});

/* Redesign ticket 11: the door leads with the person's history, and one
   span drives every read on it. Phase 11 ticket 07: under the facts, the
   door is a grid of readings and a resurfacing block, and nothing else. */
describe('the Look back door leads with the rail, and the span is the range', () => {
  it('opens on the title, the rail, the facts, the picks, the grid, then the resurfacing pair', () => {
    const body = markup(stats);
    const header = body.indexOf('<ScreenHeader title={m.nav_lookback()}');
    const rail = body.indexOf('<SpanTimeline');
    const facts = body.indexOf('data-lookback-fact');
    const picks = body.indexOf('key="lookback-quick"');
    const readLine = body.indexOf('data-lookback-read');
    const grid = body.indexOf('<ReadingGrid');
    const pair = body.indexOf('<TileGrid');
    expect(header).toBeGreaterThan(-1);
    expect(rail).toBeGreaterThan(header);
    expect(facts).toBeGreaterThan(rail);
    expect(picks).toBeGreaterThan(facts);
    expect(readLine).toBeGreaterThan(picks);
    expect(grid).toBeGreaterThan(readLine);
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
    expect(timeline).toContain('railLegendKinds(history, surgeries, bands.length > 0)');
    expect(timeline).toMatch(/\.span-tl-hband\[data-span-band='regimen'\] \{[^}]*background: var\(--text-2\);/);
    expect(timeline).toMatch(
      /\.span-tl-hband\[data-span-band='tryout'\] \{[^}]*background: var\(--bg\);\s*border-color: var\(--text-2\);/
    );
    expect(timeline).not.toMatch(/span-tl-hband[\s\S]{0,400}--role-draw/);
  });

  it('shows the drag hint once per journal and lets the first move answer it', () => {
    expect(stats).toContain('hintSeen={prefs.spanRailHintDismissed}');
    expect(stats).toContain('onHintSeen={() => (prefs.spanRailHintDismissed = true)}');
    expect(timeline).toContain('{#if showHint}');
    expect((timeline.match(/answerHint\(\);/g) ?? []).length).toBe(2);
  });

  it('reaches the three cadence routes one tap each, as links', () => {
    for (const cadence of ['week', 'month', 'year']) expect(stats).toContain(`href: '/wrapped/${cadence}'`);
    expect(stats).not.toContain('key="stats-range"');
  });

  it('hands the span to /wrapped/range at the query the picker writes', () => {
    expect(stats).toContain("href={`/wrapped/range${spanRangeQuery(span)}`}");
    expect(stats).not.toContain('href="/wrapped/range"');
  });

  it('says why a span cannot draw, in the words the range view uses', () => {
    expect(stats).toMatch(/\{:else if enoughEntries\}\s*<a class="lookback-read"[\s\S]*?\{:else\}\s*<span class="lookback-thin" data-lookback-thin>\s*\{m\.wrapped_thin_body\(/);
  });

  /* Wrapped's second line is always mood; this one is deliberately not, so
     the door's first number is never a scale nobody keeps. The door reads
     the active scale's own series for it - it no longer reads every
     scale's, that card is the day-by-day reading's now. */
  it('shows the active scale\'s average, not always mood, off one series', () => {
    expect(stats).toContain('j.stats.dayAverages(shown.key, from, to)');
    expect(stats).toContain('m.lookback_facts_average({ name: shown.name })');
    expect(stats).not.toContain('metrics.map((mt) => mt.key)');
  });

  it('reads entries and the scale that moved furthest off the one recap read', () => {
    expect(stats).toContain("import { recapDimChange } from '$lib/data/recapDisplay';");
    expect(stats).toContain('let dimChange = $derived(recapQuery.value ? recapDimChange(recapQuery.value) : null);');
    expect(stats).toContain('{m.wrapped_scale_arc()}');
  });

  it('draws no facts under the floor, where the thin-body line already says why', () => {
    expect(stats).toMatch(/\{#if recapQuery\.loading \|\| activeSeriesQuery\.loading\}\s*<Skeleton variant="line" count=\{3\} \/>\s*\{:else if enoughEntries\}\s*<ListCard/);
  });

  it('gates the two look-back teasers separately, the way Home did', () => {
    expect(stats).toMatch(/\{#if prefs\.wrappedEnabled\}\s*<WrappedHomeCard \/>/);
    expect(stats).toMatch(/\{#if prefs\.onThisDayEnabled\}\s*<OnThisDayHomeCard/);
  });

  it('waits for the rail and has a day-one shape', () => {
    expect(stats).toMatch(/\{#if railLoading\}\s*<Skeleton/);
    expect(stats).toMatch(/\{:else if railStart === null\}\s*<Notice icon="clock" key="lookback-empty"/);
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
      '<DaysReading span={resolvedSpan}',
      '<WordsReading view="tile"',
      '<TagsReading span={resolvedSpan}',
      '<HighestReading span={resolvedSpan}',
      '<BodyMapTile span={resolvedSpan}',
      '<CompareTile span={resolvedSpan}',
      '<ThemesReading span={resolvedSpan}'
    ];
    let last = body.indexOf('<ReadingGrid');
    for (const tag of order) {
      const at = body.indexOf(tag);
      expect(at, tag).toBeGreaterThan(last);
      last = at;
    }
    expect((body.match(/view="tile"/g) ?? []).length).toBe(7);
  });

  it('opens each reading at /stats/<reading> carrying the span, through one address rule', () => {
    for (const key of ['dayByDay', 'plane', 'days', 'tags', 'highest', 'themes'] as const) {
      expect(readings[key], key).toMatch(/href=\{readingHref\('[a-z-]+', span\)\}/);
    }
    expect(stats).toContain("href={readingHref('words', resolvedSpan)}");
    expect(readings.bodyMap).toContain('href={`/body-map${spanRangeQuery(span)}`}');
    expect(readings.compare).toContain('href={compareStretchQuery(span, before)}');
  });

  it('has a tile only where the span holds data for it', () => {
    expect(readings.dayByDay).toMatch(/\{#if !seriesQuery\.loading && plotted\.points\.length\}\s*<ReadingTile/);
    expect(readings.plane).toMatch(/\{#if canPlot && !constellationQuery\.loading && points\.length\}\s*<ReadingTile/);
    expect(readings.days).toMatch(/\{#if !moodQuery\.loading && enoughEntries && top\}\s*<ReadingTile/);
    expect(readings.words).toMatch(/\{#if !entriesQuery\.loading && !erasQuery\.loading && weighted\.length\}\s*<ReadingTile/);
    expect(readings.tags).toMatch(/\{#if !correlationCardsQuery\.loading && topRow && topCard\}\s*<ReadingTile/);
    expect(readings.highest).toMatch(/\{#if !seriesQuery\.loading && enoughEntries && topRow\}\s*<ReadingTile/);
    expect(readings.themes).toMatch(/\{#if !poolQuery\.loading && top\}\s*<ReadingTile/);
    expect(readings.bodyMap).toMatch(/\{#if !mapQuery\.loading && region\}\s*<ReadingTile/);
    expect(readings.compare).toMatch(/\{#if !short\}\s*<ReadingTile/);
  });

  /* The plane's tile is its drawing (Alicja on the spike: "drop the title -
     just show the small header and a bigger graph"). */
  it('gives the plane\'s tile no headline and every other tile one', () => {
    const planeTile = markup(readings.plane).match(/<ReadingTile[\s\S]*?>/)?.[0] ?? '';
    expect(planeTile).not.toContain('headline=');
    for (const key of ['dayByDay', 'days', 'words', 'tags', 'highest', 'themes', 'bodyMap', 'compare'] as const) {
      const tile = markup(readings[key]).match(/<ReadingTile[\s\S]*?>/)?.[0] ?? '';
      expect(tile, key).toContain('headline=');
    }
  });

  it('reads every ranged reading over the span, not over today', () => {
    expect(readings.dayByDay).toContain('j.stats.dayAverages(key, rangeFrom, rangeTo)');
    expect(readings.dayByDay).toContain('j.stats.daySpread(shown.key, from, to)');
    expect(readings.days).toContain('j.stats.tagShare(from, to)');
    expect(readings.days).toContain("j.stats.dayAverages('mood', from, to)");
    expect(readings.tags).toContain('j.correlationCards.getCards(from, to)');
    expect(readings.highest).toContain('j.stats.dayAverages(highestMetric.key, from, to)');
    expect(readings.themes).toContain('counterevidencePool(EUPHORIA_TAG_KEYS, COUNTEREVIDENCE_LIMIT, { from, to })');
    expect(readings.bodyMap).toContain('j.stats.bodyRegionMap(from, to)');
    expect(readings.plane).toContain('j.stats.constellationReadings(x, y, from, to)');
    for (const source of Object.values(readings)) expect(source).not.toMatch(/\(from, today\)/);
  });

  it('has one route for the seven readings, which reads the span back and refuses a key it does not know', () => {
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

/* Redesign ticket 05: the merged tag card draws as paired dots, not bars. */
describe('the merged tag card draws as paired dots', () => {
  it('feeds PairedDots, not BarRows, for the merged ranking', () => {
    expect(readings.tags).toContain('<PairedDots rows={correlationRows} onPick={pickCorrelationRow} />');
    expect(readings.tags).not.toContain('kind="tag-insights"');
    expect(readings.tags).not.toContain('kind="correlations"');
  });

  it('still opens the entries sheet for a tag row, and skips the dose-day row', () => {
    expect(readings.tags).toMatch(/const pickCorrelationRow = \(key: string\) => \{[\s\S]{0,200}occurrence\.kind === 'tag'/);
  });
});

/* Phase 11 ticket 07: the on-this-day tile opens in place, and the route it
   used to open still renders the same block for the notification deep link
   (ADR-0028). */
describe('the resurfacing block', () => {
  it('opens the day under the pair without leaving the door, and keeps the route on the same block', () => {
    expect(stats).toMatch(/onOpen=\{\(event\) => \{\s*event\.preventDefault\(\);\s*dayOpen = !dayOpen;/);
    expect(stats).toMatch(/\{#if dayOpen && prefs\.onThisDayEnabled\}\s*<div class="lookback-day" id="lookback-day" data-lookback-day transition:disclose>\s*<OnThisDayBlock \/>/);
    const onThisDay = read('src/routes/on-this-day/+page.svelte');
    expect(onThisDay).toContain('<OnThisDayBlock {scrollTo} />');
    expect(onThisDay).toContain("page.url.searchParams.get('lookback')");
    const block = read('src/lib/components/OnThisDayBlock.svelte');
    expect(block).toContain('data-lookback={d.key}');
    expect(block).toContain('data-lookback-open={d.key}');
  });
});
