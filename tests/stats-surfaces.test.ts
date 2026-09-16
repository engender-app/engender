/* The stats screen's emptiness rule (phase 8 UX ticket 03, ADR-0056). The
   two interval folds this file used to hold to the same rule left for
   /care whole (redesign ticket 05); their own describe block went with
   them, to tests/care-surfaces.test.ts.

   Greps by design (ticket 08): every one of these is a Svelte template fact
   - which branch a panel is inside - rather than a function with an answer
   to call. The rule the file has to satisfy is that nothing on this screen
   renders for a practice the person has never done, and a template can only
   be held to that by reading it. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const stats = readFileSync(root + 'src/routes/stats/+page.svelte', 'utf8');
/* The rail is its own component, and three of this door's own rules live
   in it rather than on the page (ticket 06): where the span line sits,
   which stripe each band kind takes, and the one-time drag hint. */
const timeline = readFileSync(root + 'src/lib/components/SpanTimeline.svelte', 'utf8');

describe('the summary panels wait for the floor', () => {
  /* WRAPPED_ENTRY_FLOOR, read off the module that owns it rather than
     written here as a 5 - ADR-0056's "no new magic numbers". */
  it('reads its floor from the module that owns it', () => {
    expect(stats).toContain("import { WRAPPED_ENTRY_FLOOR } from '$lib/data/wrapped'");
    expect(stats).toContain('let enoughEntries = $derived(entryCount >= WRAPPED_ENTRY_FLOOR);');
    // No literal 5 anywhere: ADR-0056's "no new magic numbers".
    expect(stats).not.toMatch(/>= 5\b/);
  });

  it('draws no scale bars under the floor', () => {
    expect(stats).toMatch(/\{:else if enoughEntries\}\s*<BarRows rows=\{scaleRows\} measure="track" \/>/);
  });

  it('draws no mood strip under the floor', () => {
    expect(stats).toMatch(/\{:else if enoughEntries\}\s*<OrderedStrip steps=\{moodSteps\} \/>/);
  });

  /* Three cards hand BarRows a position between 0 and 1 in something's own
     range, and the primitive re-normalised all three against their own
     longest bar until this ticket gave it a `scale`. A journal whose scales
     all sat near the bottom drew the same near-full wall as one whose scales
     all sat near the top. */
  it('asks for the track where the bar is an absolute position', () => {
    /* `valueRows` was a third caller until ticket 99 item 26 took the values
       sheet away; the rows it built are a hidden text list now and draw no
       bar at all. `\\s+` and not a space: the highest days card passes four
       props and wraps them a line each. */
    for (const rows of ['scaleRows', 'highestRows']) {
      expect(stats).toMatch(new RegExp(`<BarRows\\s+rows=\\{${rows}\\}[^>]*measure="track"`));
    }
  });

  it('stops offering a second scale on a chart with no first one', () => {
    expect(stats).toContain('{#if metrics.length > 1 && plotted.points.length}');
  });

  /* The sheet and the link that opened it went in ticket 99 item 26. The
     gate did not: the series is still written out for a screen reader, and
     an empty list under an empty chart would be as wrong as an empty sheet
     was. tests/accessibility-audit.test.ts holds the other half - that the
     numbers are still readable as text at all. */
  it('writes the values out only where there are values', () => {
    expect(stats).toMatch(/\{#if valueRows\.length\}\s*<ul class="visually-hidden" data-values-list/);
  });

  /* The card used to render only for somebody who keeps euphoria (phase 8
     features ticket 20). Phase 9 carpet ticket 11 gave it a chooser, so it
     renders for everybody and which scale it ranks is `highestMetricKey`'s
     answer - the euphoria default and the unticked-since case are held
     there, with their own tests. What is still this screen's to get right is
     that the chooser writes the card's own state and not the stored metric
     preference two other screens shade by, and that no ranking is drawn
     before the journal clears the entry floor. */
  it('ranks by the chooser, over the floor, without touching the stored metric', () => {
    expect(stats).toMatch(/highestMetricKey\(\s*highestKey,/);
    expect(stats).toMatch(/key="highest-metric"[\s\S]*?onPick=\{\(value\) => \(highestKey = value\)\}/);
    expect(stats).toMatch(/\{:else if enoughEntries && highestRows\.length\}\s*<BarRows\s+rows=\{highestRows\}/);
  });
});

/* The area index - a row per area in the More hub's own four groups - was
   removed by ticket 99 item 36: "stats shouldnt have the 'more' list at the
   end. it is only the stats tab." What survives it is the rule the index was
   held to, which outlives the block itself. */
describe('the stats tab keeps out of the areas' + "'" + ' business', () => {
  it('asks for no per-area read at all', () => {
    for (const call of ['getMeasurementsInRange', 'getMostRecentAnalyte', 'wearTimeTrend', 'tallyTrend']) {
      expect(stats).not.toContain(call);
    }
  });
});

/* Redesign ticket 11: the door leads with the person's history, and one
   span drives every read on it. */
describe('the Look back door leads with the rail, and the span is the range', () => {
  it('opens on the title, the quick picks, then the rail', () => {
    const header = stats.indexOf('<ScreenHeader title={m.nav_lookback()}');
    const picks = stats.indexOf('key="lookback-quick"');
    const rail = stats.indexOf('<SpanTimeline');
    const cross = stats.indexOf('<SectionHeading text={m.stats_group_cross()} />');
    expect(header).toBeGreaterThan(-1);
    expect(picks).toBeGreaterThan(header);
    expect(rail).toBeGreaterThan(picks);
    expect(cross).toBeGreaterThan(rail);
  });

  /* Ticket 06: the line naming the span used to be the header's subtitle,
     two elements above the rail it is a reading of, where it parsed as a
     subtitle of the door's title. The rail owns it now, against the
     handles that move it. */
  it('writes the span under the rail rather than under the title', () => {
    expect(stats).not.toContain('subtitle={spanLabel}');
    expect(timeline).toContain('data-span-state-line');
    expect(timeline.indexOf('data-span-state-line')).toBeGreaterThan(timeline.indexOf('class="span-tl-rail"'));
  });

  /* The rail draws every dated history the journal holds, not the two it
     happens to be handed directly: the other three stretch kinds and the
     surgery days come out of the one annotations query. */
  it('reads the rest of the history through the annotations query, over the whole rail', () => {
    expect(stats).toContain('j.chartAnnotations.getAnnotations(start, today, today)');
    expect(stats).toContain('historyBands(railAnnotationsQuery.rows)');
    expect(stats).toContain('surgeryMarks(railAnnotationsQuery.rows)');
  });

  it('names only the kinds present, and gives no two of them one stripe', () => {
    expect(timeline).toContain('railLegendKinds(history, surgeries, bands.length > 0)');
    // The two coloured lanes, by kind rather than by position.
    expect(timeline).toMatch(/kind === 'regimen' \? roleAt\(railRoles, 0\)/);
    expect(timeline).toMatch(/kind === 'tryout' \? roleAt\(railRoles, 1\)/);
    // A break is an absence, so it takes no stripe at all.
    expect(timeline).toMatch(/\.span-tl-hband\.is-break \{\s*background: var\(--text-2\);/);
  });

  it('shows the drag hint once per journal and lets the first move answer it', () => {
    expect(stats).toContain('hintSeen={prefs.spanRailHintDismissed}');
    expect(stats).toContain('onHintSeen={() => (prefs.spanRailHintDismissed = true)}');
    expect(timeline).toContain('{#if showHint}');
    // Both ways a handle moves answer it: the finger and the key.
    expect((timeline.match(/answerHint\(\);/g) ?? []).length).toBe(2);
  });

  it('reaches the three cadence routes one tap each, as links', () => {
    for (const cadence of ['week', 'month', 'year']) expect(stats).toContain(`href: '/wrapped/${cadence}'`);
    expect(stats).not.toContain('key="stats-range"');
  });

  /* The acceptance box: the retrospective reads the span through the same
     query the range picker writes. `spanRangeQuery` is `wrappedRangeQuery`
     over the two days, and lookBackSpan.test.ts parses it back. */
  it('hands the span to /wrapped/range at the query the picker writes', () => {
    expect(stats).toContain("href={`/wrapped/range${spanRangeQuery(span)}`}");
    expect(stats).not.toContain('href="/wrapped/range"');
  });

  it('says why a span cannot draw, in the words the range view uses', () => {
    expect(stats).toMatch(/\{:else if enoughEntries\}\s*<a class="lookback-read"[\s\S]*?\{:else\}\s*<span class="lookback-thin" data-lookback-thin>\s*\{m\.wrapped_thin_body\(/);
  });

  /* The whole-app audit's own finding 1: "zero facts in the first
     viewport" - the door used to lead with six ways out and no number
     about the span. Wrapped's own three-line shape, directly under the
     rail's own line and before the era offer or the tile grid, neither of
     which is a card either but both of which are what "before any card"
     has to mean here: the first real card is the cross-journal section
     below. */
  it('puts the span\'s facts directly under the rail, before the tile grid', () => {
    const railLine = stats.indexOf('class="lookback-line"');
    const facts = stats.indexOf('data-lookback-fact');
    const eraOffer = stats.indexOf('data-era-offer');
    const tileGrid = stats.indexOf('<TileGrid');
    expect(railLine).toBeGreaterThan(-1);
    expect(facts).toBeGreaterThan(railLine);
    expect(facts).toBeLessThan(eraOffer);
    expect(facts).toBeLessThan(tileGrid);
  });

  /* Wrapped's second line is always mood (WrappedCompact.svelte); this
     one is deliberately not, so the door's first number is never a scale
     nobody keeps. `activeScaleRow` is `scaleRows`'s own entry for
     `shown.key`, the same stored preference the day-by-day chart and the
     merged tag card already shade by. */
  it('shows the active scale\'s average, not always mood', () => {
    expect(stats).toContain(
      'let activeScaleRow = $derived(scaleRows.find((row) => row.key === shown.key));'
    );
    expect(stats).toContain('m.lookback_facts_average({ name: shown.name })');
  });

  /* Same source, same naming step wrapped uses (recapDisplay.ts's
     recapDimChange) - one read answers the door's own retrospective link,
     the entry count and the scale that moved furthest all at once
     (ADR-0056, ADR-0010). */
  it('reads entries and the scale that moved furthest off the one recap read', () => {
    expect(stats).toContain('import { recapDimChange } from \'$lib/data/recapDisplay\';');
    expect(stats).toContain(
      'let dimChange = $derived(recapQuery.value ? recapDimChange(recapQuery.value) : null);'
    );
    expect(stats).toContain('{m.wrapped_scale_arc()}');
  });

  it('draws no facts under the floor, where the thin-body line already says why', () => {
    expect(stats).toMatch(/\{#if recapQuery\.loading\}\s*<Skeleton variant="line" count=\{3\} \/>\s*\{:else if enoughEntries\}\s*<ListCard/);
  });

  it('reads every ranged chart over the span, not over today', () => {
    for (const read of ['j.stats.recap(from, to)', 'j.stats.tagShare(from, to)', 'j.stats.daySpread(shown.key, from, to)', 'j.correlationCards.getCards(from, to)']) {
      expect(stats).toContain(read);
    }
    expect(stats).not.toMatch(/\(from, today\)/);
  });

  it('gates the two look-back teasers separately, the way Home did', () => {
    expect(stats).toMatch(/\{#if prefs\.wrappedEnabled\}\s*<WrappedHomeCard \/>/);
    expect(stats).toMatch(/\{#if prefs\.onThisDayEnabled\}\s*<OnThisDayHomeCard \/>/);
  });

  it('waits for the rail and has a day-one shape', () => {
    expect(stats).toMatch(/\{#if railLoading\}\s*<Skeleton/);
    expect(stats).toMatch(/\{:else if railStart === null\}\s*<Notice icon="clock" key="lookback-empty"/);
  });

  /* Redesign ticket 43 merged the rail into /transition/milestones, so this
     row left: it was the one row on this list opening another area's screen,
     and Look back keeps the readings it owns. What the list still has to be
     is the look-back views, every one of which lights this same tab. */
  it('leads out only to look-back views of its own, not to another area\'s screen', () => {
    expect(stats).not.toContain('key="timeline"');
    for (const key of ['body-map', 'compare']) {
      expect(stats).toContain(`key="${key}"`);
    }
  });

  /* Redesign ticket 05: both rows in the list take the span rather than
     opening on their own empty or default state. `resolvedSpan` is
     `from`/`to` as the `Span` object the two query-builders take -
     compareStretch.test.ts already proves precedingWindow/compareStretchQuery
     mint the right query for any span; this is the one line that hands
     them Look back's own. */
  it('hands both look-back rows the resolved span, not an empty query', () => {
    expect(stats).toContain('href={`/body-map${spanRangeQuery(resolvedSpan)}`}');
    expect(stats).toContain('href={compareStretchQuery(resolvedSpan, precedingWindow(resolvedSpan))}');
  });
});

/* Redesign ticket 05: the merged tag card draws as paired dots, not bars -
   Alicja's call over the bars the tag-insights half of the duplication
   drew, since a paired dot reads each row against its own track rather
   than against the longest one in the set, and needs no normalizing to
   mix scales in one card the way a bar's leader measure would. */
describe('the merged tag card draws as paired dots', () => {
  it('feeds PairedDots, not BarRows, for the merged ranking', () => {
    expect(stats).toContain('<PairedDots rows={correlationRows} onPick={pickCorrelationRow} />');
    expect(stats).not.toContain('kind="tag-insights"');
    expect(stats).not.toContain('kind="correlations"');
  });

  it('still opens the entries sheet for a tag row, and skips the dose-day row', () => {
    expect(stats).toMatch(
      /const pickCorrelationRow = \(key: string\) => \{[\s\S]{0,200}occurrence\.kind === 'tag'/
    );
  });
});
