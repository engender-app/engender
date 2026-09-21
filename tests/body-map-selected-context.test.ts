/* The body map names what it has selected (phase 11 pre-production UI/UX
   ticket 30). The behaviour is proved in a real browser by
   tests/body-map-selected-context.mjs - a tap on a panel, four data states
   and a jump that comes back. What is here is the part a browser cannot
   see: that both catalogues carry the words, and that the jump and its
   landing still address each other. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

const bodyMap = read('src/routes/body-map/+page.svelte');
const figure = read('src/lib/components/BodyRegionMap.svelte');
const en = JSON.parse(read('messages/en.json'));
const pl = JSON.parse(read('messages/pl.json'));

const KEYS = [
  'body_map_selected_reading',
  'body_map_selected_mixed',
  'body_map_selected_none',
  'body_map_chart_jump'
];

describe('the selected region beside the body map (pre-production UI/UX 30)', () => {
  it('carries its words in both catalogues', () => {
    for (const key of KEYS) {
      expect(en[key], `en missing ${key}`).toBeDefined();
      expect(pl[key], `pl missing ${key}`).toBeDefined();
    }
  });

  /* A count is a plural in both languages and neither of them has two forms
     of it: English has one and other, Polish has one, few and many, and a
     sentence written as a single string reads "1 readings" in the first and
     is simply wrong in the second. */
  it('counts readings through the plural machinery, not through one string', () => {
    for (const [locale, catalogue] of [
      ['en', en],
      ['pl', pl]
    ] as const) {
      const variants = catalogue.body_map_selected_reading;
      expect(Array.isArray(variants), `${locale} spells the count out`).toBe(true);
      expect(Object.keys(variants[0].match)).toContain('countPlural=one');
      expect(Object.keys(variants[0].match)).toContain('countPlural=other');
    }
    expect(Object.keys(pl.body_map_selected_reading[0].match)).toContain('countPlural=few');
  });

  it('names the pick beside the figure and sends it to the charts', () => {
    expect(bodyMap).toContain('data-body-map-selected');
    expect(bodyMap).toContain('data-body-map-summary');
    expect(bodyMap).toMatch(/href="#body-map-charts"/);
    expect(bodyMap).toContain('id="body-map-charts"');
  });

  /* The sentence and the panel's own accessible name are two readings of one
     answer. Neither may grow its own guard for "nothing logged here": the
     figure would then paint a region one way and the words under it could
     say another. */
  it('reads the figure and the sentence off the same summary', () => {
    expect(bodyMap).toContain('regionSummary(');
    expect(figure).toContain('regionSummary(');
    expect(figure).not.toContain('reading.side === null');
  });
});
