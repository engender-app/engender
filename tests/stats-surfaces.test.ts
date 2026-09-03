/* Ticket 05 (phase 8 UX): two explanatory notes on the stats screen used to
   print unconditionally next to cards whose bodies already knew there was
   nothing to show. Greps by design (ticket 08): the gate is a Svelte
   template fact, not a function with an answer to call. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const stats = readFileSync(root + 'src/routes/stats/+page.svelte', 'utf8');

describe('the interval notes say nothing on a journal with no doses', () => {
  it('gates interval_mood_sub on the same read its card uses', () => {
    /* intervalMoodPattern is intervalMoodQuery.rows (the read the card's own
       ReadGate branches on), not a second predicate over the query. */
    expect(stats).toMatch(/\{#if intervalMoodPattern\.length\}\s*<p class="stats-note">\{m\.interval_mood_sub\(\)\}<\/p>\s*\{\/if\}/);
  });

  it('gates custom_interval_sub on the same read its card uses', () => {
    expect(stats).toMatch(/\{#if customIntervalPattern\.length\}\s*<p class="stats-note">\{m\.custom_interval_sub\(\)\}<\/p>\s*\{\/if\}/);
    expect(stats).toContain('let customIntervalPattern = $derived(customIntervalQuery.rows);');
  });
});
