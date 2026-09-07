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
     it prints on exactly the branch the chart prints on.

     The window is generous because what is being checked is which branch the
     line sits on, never how far down it sits: ticket 99 item 34 put an
     explainer and its comment above it, which is the kind of thing that
     belongs there and should not fail this. */
  it('puts the all-history line inside the interval fold that draws it', () => {
    expect(stats).toMatch(
      /<ReadGate read=\{intervalMoodQuery\}[\s\S]{0,120}\{#snippet rows\(\)\}[\s\S]{0,2000}?<p class="stats-inline-note">\{m\.stats_all_history\(\)\}<\/p>/
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
