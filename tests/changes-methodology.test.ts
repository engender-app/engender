/* Ticket 20 (pre-production UI/UX audit, UX17): Put recording and reading
   changes before long methodology.

   Keeps an explicit Record a change action and count near the timeline. Retains
   a short visible distinction between personal observations and literature bands;
   moves longer method/source text into an accessible disclosure. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

const changesRoute = read('src/routes/care/changes/+page.svelte');
const noticedAxis = read('src/lib/components/NoticedAxis.svelte');
const en = JSON.parse(read('messages/en.json'));
const pl = JSON.parse(read('messages/pl.json'));

describe('ticket 20: changes methodology disclosure and record action', () => {
  describe('catalogue contracts for methodology and recording', () => {
    it('defines short bands limitation in both languages', () => {
      expect(en.effects_bands_limitation).toContain('Shaded bands describe the literature');
      expect(en.effects_bands_limitation).toContain('not a schedule for your own body');
      expect(pl.effects_bands_limitation).toContain('Zacieniowane pasy opisują literaturę');
      expect(pl.effects_bands_limitation).toContain('nie harmonogram dla twojego ciała');
    });

    it('defines methodology disclosure label in both languages', () => {
      expect(en.effects_methodology_disclosure).toBe('Methodology and sources');
      expect(pl.effects_methodology_disclosure).toBe('Metodologia i źródła');
    });

    it('defines explicit record a change action label in both languages', () => {
      expect(en.effect_record_change).toBe('Record a change');
      expect(pl.effect_record_change).toBe('Zapisz zmianę');
    });
  });

  describe('NoticedAxis carries the explicit record action near the timeline', () => {
    it('accepts onRecord callback prop', () => {
      expect(noticedAxis).toContain('onRecord');
    });

    it('renders a labelled Record a change button with data-record-change', () => {
      expect(noticedAxis).toContain('data-record-change');
      expect(noticedAxis).toContain('m.effect_record_change()');
      expect(noticedAxis).toContain('onclick={onRecord}');
    });

    it('groups the summary and record action before the plot', () => {
      const summaryPos = noticedAxis.indexOf('{summary}');
      const recordBtnPos = noticedAxis.indexOf('data-record-change');
      const plotPos = noticedAxis.indexOf('class="na-plot"');

      expect(summaryPos).toBeGreaterThan(-1);
      expect(recordBtnPos).toBeGreaterThan(-1);
      expect(plotPos).toBeGreaterThan(-1);
      expect(summaryPos).toBeLessThan(plotPos);
      expect(recordBtnPos).toBeLessThan(plotPos);
    });
  });

  describe('changes route connects record action and folds long methodology', () => {
    it('wires onRecord on NoticedAxis to the side effect record editor', () => {
      expect(changesRoute).toMatch(/<NoticedAxis[^>]*\bonRecord=\{[^}]*record\.openEditor/s);
    });

    it('shows short visible limitation before the methodology disclosure', () => {
      expect(changesRoute).toContain('m.effects_bands_limitation()');
      const limitationPos = changesRoute.indexOf('m.effects_bands_limitation()');
      const disclosurePos = changesRoute.indexOf('data-methodology-toggle');
      expect(limitationPos).toBeGreaterThan(-1);
      expect(disclosurePos).toBeGreaterThan(-1);
      expect(limitationPos).toBeLessThan(disclosurePos);
    });

    it('provides accessible disclosure toggle with aria-expanded', () => {
      expect(changesRoute).toContain('data-methodology-toggle');
      expect(changesRoute).toContain('aria-expanded={methodologyOpen}');
      expect(changesRoute).toContain('m.effects_methodology_disclosure()');
    });

    it('folds effects_intro, effect_variability_notice, and effects_source into the disclosure', () => {
      const disclosureToggle = changesRoute.indexOf('data-methodology-toggle');
      const disclosedBody = changesRoute.indexOf('{#if methodologyOpen}');
      expect(disclosureToggle).toBeGreaterThan(-1);
      expect(disclosedBody).toBeGreaterThan(-1);

      const disclosureSlice = changesRoute.slice(disclosedBody, changesRoute.indexOf('{/if}', disclosedBody));
      expect(disclosureSlice).toContain('m.effects_intro()');
      expect(disclosureSlice).toContain('m.effect_variability_notice()');
      expect(disclosureSlice).toContain('m.effects_source()');
    });

    it('does not duplicate effects_source outside the disclosure', () => {
      const occurrences = (changesRoute.match(/m\.effects_source\(\)/g) || []).length;
      expect(occurrences).toBe(1);
    });
  });
});
