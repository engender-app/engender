/* The stats screen's emptiness rule (phase 8 UX ticket 03, ADR-0056), and
   ticket 05's two notes before it.

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

describe('the two folds say they read the whole journal, and only when they draw', () => {
  /* Ticket 05 gated the old paragraphs; this ticket replaced what they said.
     The header above them names the range picker's window and these two
     cards ignore it on purpose, so the line that used to explain the fold
     now says which journal it read. Inside the ReadGate's `rows` snippet, so
     it prints on exactly the branch the chart prints on. */
  it('puts the all-history line inside the interval fold that draws it', () => {
    expect(stats).toMatch(
      /<ReadGate read=\{intervalMoodQuery\}[\s\S]{0,120}\{#snippet rows\(\)\}[\s\S]{0,900}?<p class="stats-inline-note">\{m\.stats_all_history\(\)\}<\/p>/
    );
  });

  it('puts it inside the custom fold too', () => {
    expect(stats).toMatch(
      /\{#snippet rows\(customIntervalPattern\)\}\s*\{#if foldDrawable\(customIntervalPattern\)\}\s*<p class="stats-inline-note">\{m\.stats_all_history\(\)\}<\/p>/
    );
    expect(stats).toContain('let customIntervalPattern = $derived(customIntervalQuery.rows);');
  });

  /* Both folds say they read the whole journal, so neither may be gated on a
     count of the range above them - which is what they were, and it hid both
     cards for a long dose history with a quiet month. The floor is
     WRAPPED_ENTRY_FLOOR positions of the fold's own all-history output. */
  it('gates each fold on its own output, not on the range', () => {
    expect(stats).toMatch(
      /const foldDrawable = \(pattern[^)]*\) => pattern\.length >= WRAPPED_ENTRY_FLOOR;/
    );
    expect(stats.match(/\{#if foldDrawable\(/g)).toHaveLength(2);
  });

  /* Alicja, on the rendered screen: an interval fold is keyed on a position
     and drew a value gutter with no ends at all, so the one thing the picture
     is keyed on went unnamed. */
  it('names both ends of each fold axis', () => {
    expect(stats.match(/\{@const ends = positionEnds\(/g)).toHaveLength(2);
    expect(stats.match(/from=\{ends\.from\}\s*to=\{ends\.to\}/g)).toHaveLength(2);
    expect(stats).toContain("m.interval_day_n({ n: String(point.x) })");
  });

  it('leaves no ungated paragraph explaining a chart nobody has data for', () => {
    expect(stats).not.toContain('m.interval_mood_sub()');
    expect(stats).not.toContain('m.custom_interval_sub()');
  });

  /* `.stats-note` hung a sentence under the card it qualified, where its
     margin-top of 8 collapsed under the card's own 24 and left it reading as
     a preamble to the next chart. All three consumers are inside their cards
     now and the class is gone from both stylesheets. */
  it('hangs no note outside the card it belongs to', () => {
    expect(stats).not.toMatch(/class="stats-note"/);
  });
});

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
    for (const rows of ['scaleRows', 'highestRows', 'valueRows']) {
      expect(stats).toMatch(new RegExp(`<BarRows\\s+rows=\\{${rows}\\}[^>]*measure="track"`));
    }
  });

  it('stops offering a second scale on a chart with no first one', () => {
    expect(stats).toContain('{#if metrics.length > 1 && plotted.points.length}');
  });

  it('offers the values sheet only where there are values', () => {
    expect(stats).toMatch(/\{#if valueRows\.length\}\s*<button class="stats-open"/);
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

describe('the area index', () => {
  it('decides which cards exist through the shared seam, not a predicate of its own', () => {
    expect(stats).toContain("import { cardsInGroup, statsAreaCards, STATS_AREA_GROUPS");
    expect(stats).toContain('j.lastWrite.getLastWrites(today)');
    expect(stats).toContain('j.areaStates.getAreaStates()');
  });

  it('renders no heading for a group the person uses nothing in', () => {
    expect(stats).toMatch(/\{#if groupCards\(group\)\.length\}\s*<SectionHeading text=\{GROUP_NAME\[group\]\(\)\}/);
  });

  /* Alicja's call on the rendered screen: no graphs in this block. Every one
     of these areas owns its chart on its own screen, and a second drawing
     here is a second thing to keep in agreement. The index is rows, and each
     row is the way to the screen that draws the real one. */
  it('draws no chart in the index, only rows into the owning screens', () => {
    const index = stats.slice(stats.indexOf('{#each STATS_AREA_GROUPS as group'));
    expect(index).not.toContain('<AreaChart');
    expect(index).not.toContain('<ChartCard');
    expect(index).toMatch(/<ListRow[\s\S]{0,200}href=\{card\.panel\.href\}/);
  });

  it('asks for no per-area read at all', () => {
    for (const call of ['getMeasurementsInRange', 'getMostRecentAnalyte', 'wearTimeTrend', 'tallyTrend']) {
      expect(stats).not.toContain(call);
    }
  });
});
