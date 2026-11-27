/* Ticket 20 (pre-production UI/UX audit, UX17): Put recording and reading
   changes before long methodology.

   Keeps an explicit Record a change action and count near the timeline. Retains
   a short visible distinction between personal observations and literature bands;
   moves longer method/source text into an accessible disclosure.

   Functional audit ticket 22 put the bands themselves behind that disclosure,
   renamed "What the literature says": no band, no timing sentence and no
   limitation line until it opens, and each band's source printed inside it. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

const changesRoute = read('src/routes/care/changes/+page.svelte');
const timeline = read('src/lib/components/EffectsTimeline.svelte');
const noticedAxis = read('src/lib/components/NoticedAxis.svelte');
const en = JSON.parse(read('messages/en.json'));
const pl = JSON.parse(read('messages/pl.json'));

describe('ticket 20: changes methodology disclosure and record action', () => {
  describe('catalogue contracts for methodology and recording', () => {
    it('defines short bands limitation in both languages', () => {
      expect(en.effects_bands_limitation).toContain('Shaded bands describe the literature');
      expect(en.effects_bands_limitation).toContain('not a schedule for your own body');
      expect(pl.effects_bands_limitation).toContain('Zacieniowane zakresy opisują literaturę');
      expect(pl.effects_bands_limitation).toContain('nie rozkład jazdy twojego ciała');
    });

    it('defines the literature disclosure label and source line in both languages', () => {
      expect(en.effects_literature_disclosure).toBe('What the literature says');
      expect(pl.effects_literature_disclosure).toBe('Co mówi literatura');
      expect(en.effects_methodology_disclosure).toBeUndefined();
      for (const catalogue of [en, pl]) {
        expect(catalogue.effects_literature_source).toContain('WPATH');
        expect(catalogue.effects_literature_source).toContain('{date}');
      }
    });

    /* Bug session 18, item 64: a change of one's own is not called a side
       effect, and it is added at the end of the list rather than from a
       button over the timeline. */
    it('names a change of your own without calling it a side effect', () => {
      expect(en.effect_record_change).toBeUndefined();
      expect(en.side_effect_add).toBe('Add a change of your own');
      expect(pl.side_effect_add).toBe('Dodaj własną zmianę');
      expect(en.side_effects).toBe('Your own changes');
      expect(pl.side_effects).toBe('Twoje zmiany');
    });
  });

  describe('NoticedAxis is the timeline only', () => {
    it('carries no record button over the timeline', () => {
      expect(noticedAxis).not.toContain('onRecord');
      expect(noticedAxis).not.toContain('data-record-change');
      expect(noticedAxis.indexOf('{summary}')).toBeLessThan(noticedAxis.indexOf('class="na-plot"'));
    });
  });

  describe('changes route connects record action and folds long methodology', () => {
    it('ends the own-changes list with a row that adds one', () => {
      const section = changesRoute.slice(changesRoute.indexOf('data-side-effects-section'));
      expect(section).toMatch(/data-add-own-change[^>]*onclick=\{\(\) => record\.openEditor\(null\)\}/s);
      expect(changesRoute).not.toMatch(/<NoticedAxis[^>]*\bonRecord=/s);
    });

    /** The page source between `{#if literatureOpen}` at `from` and its `{/if}`. */
    function literatureBody(from: number): string {
      const start = changesRoute.indexOf('{#if literatureOpen}', from);
      expect(start).toBeGreaterThan(-1);
      return changesRoute.slice(start, changesRoute.indexOf('{/if}', start));
    }

    it('provides accessible disclosure toggle with aria-expanded', () => {
      expect(changesRoute).toContain('data-literature-toggle');
      expect(changesRoute).toContain('aria-expanded={literatureOpen}');
      expect(changesRoute).toContain('m.effects_literature_disclosure()');
      expect(changesRoute).toMatch(/let literatureOpen = \$state\(false\)/);
    });

    it('keeps the limitation, timing, variability and source inside the disclosure', () => {
      const body = literatureBody(changesRoute.indexOf('data-bands-context'));
      expect(body).toContain('m.effects_bands_limitation()');
      expect(body).toContain('m.effects_intro()');
      expect(body).toContain('m.effect_variability_notice()');
      expect(body).toContain('data-literature-source');
      expect(changesRoute.split('m.effects_bands_limitation()')).toHaveLength(2);
    });

    it("keeps the editor sheet's timing sentence behind the same disclosure, after the date", () => {
      const sheetDate = changesRoute.indexOf('id="effect-date"');
      const sheetLiterature = changesRoute.indexOf('data-sheet-literature');
      expect(sheetDate).toBeGreaterThan(-1);
      expect(sheetLiterature).toBeGreaterThan(sheetDate);
      const body = literatureBody(sheetLiterature);
      expect(body).toContain('{caption}');
      expect(changesRoute.split('{caption}')).toHaveLength(2);
    });

    it('draws the timeline bands only while the literature is open', () => {
      expect(changesRoute).toContain('literature={literatureOpen}');
      expect(timeline).toContain('{#if literature && row.onset}');
      expect(timeline).toContain('{#if literature && row.completion}');
      expect(timeline.match(/class="band-(onset|completion)"/g)).toHaveLength(2);
    });

    it('does not render the removed paper citation', () => {
      expect(changesRoute).not.toContain('m.effects_source()');
    });
  });
});
