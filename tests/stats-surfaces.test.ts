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
      /\{#snippet rows\(customIntervalPattern\)\}\s*<p class="stats-inline-note">\{m\.stats_all_history\(\)\}<\/p>/
    );
    expect(stats).toContain('let customIntervalPattern = $derived(customIntervalQuery.rows);');
  });

  it('leaves no ungated paragraph explaining a chart nobody has data for', () => {
    expect(stats).not.toContain('m.interval_mood_sub()');
    expect(stats).not.toContain('m.custom_interval_sub()');
  });
});

describe('the summary panels wait for the floor', () => {
  /* WRAPPED_ENTRY_FLOOR, read off the module that owns it rather than
     written here as a 5 - ADR-0056's "no new magic numbers". */
  it('reads both floors from the modules that own them', () => {
    expect(stats).toContain("import { WRAPPED_ENTRY_FLOOR } from '$lib/data/wrapped'");
    expect(stats).toContain("import { MIN_PLOT_POSITIONS } from '$lib/charts/annotations'");
    expect(stats).toContain('let enoughEntries = $derived(entryCount >= WRAPPED_ENTRY_FLOOR);');
    expect(stats).toMatch(/const drawable = \(points[^)]*\) => points\.length >= MIN_PLOT_POSITIONS;/);
  });

  it('draws no scale bars under the floor', () => {
    expect(stats).toMatch(/\{:else if enoughEntries\}\s*<BarRows rows=\{scaleRows\} \/>/);
  });

  it('draws no mood strip under the floor', () => {
    expect(stats).toMatch(/\{:else if enoughEntries\}\s*<OrderedStrip steps=\{moodSteps\} \/>/);
  });

  it('offers the values sheet only where there are values', () => {
    expect(stats).toMatch(/\{#if valueRows\.length\}\s*<button class="stats-open"/);
  });

  it('draws the highest days only where that scale is kept and the floor is cleared', () => {
    expect(stats).toMatch(/\{#if euphoriaScale\}/);
    expect(stats).toMatch(/\{:else if enoughEntries && highestRows\.length\}\s*<BarRows rows=\{highestRows\}/);
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

  it('asks for a trend area read only where that card exists', () => {
    for (const [flag, call] of [
      ['showsMeasurements', 'j.measurements.getMeasurementsInRange(from, today)'],
      ['showsLabs', 'j.labs.getMostRecentAnalyte()'],
      ['showsWear', 'j.stats.wearTimeTrend(from, today)']
    ]) {
      expect(stats).toContain(`${flag} ? ${call} : Promise.resolve(`);
    }
  });

  it('sends a card to the screen that owns the chart rather than redrawing it', () => {
    expect(stats).toMatch(/<a class="stats-area-open" href=\{card\.panel\.href\}/);
    expect(stats).toMatch(/<ListRow[\s\S]{0,200}href=\{card\.panel\.href\}/);
  });
});
