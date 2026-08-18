/* The decoy's one hard rule (ticket 30): nothing on it may hint at the
   journal. The copy lives in the catalogues like all copy does, so this
   guards the catalogue entries themselves - in both languages, against
   both languages' giveaway vocabulary, because a Polish word on the
   English screen would leak just the same. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const catalogue = (file: string): Record<string, string> => JSON.parse(readFileSync(file, 'utf8'));

const decoyEntries = (file: string): [string, string][] =>
  Object.entries(catalogue(file)).filter(([key]) => key.startsWith('decoy_'));

/* Journal-revealing vocabulary in either language. Stems, not words, so
   inflected Polish forms ("płci", "tranzycji") are caught too. Walkthrough
   flow 18 runs a shorter cut of this list over the rendered screen - the
   tiers cannot share an import - so a stem added here that could plausibly
   reach the DOM belongs there too. */
const GIVEAWAYS =
  /gender|trans|journal|diary|dysphor|euphor|hormon|pronoun|milestone|płe[cć]|płci|tranzyc|dziennik|dysfor|eufor|zaimk/i;

describe('decoy home screen copy', () => {
  for (const file of ['messages/en.json', 'messages/pl.json']) {
    it(`${file} carries decoy copy and none of it hints at the journal`, () => {
      const entries = decoyEntries(file);
      // Vacuous passes guard: the screen exists, so its copy must too.
      expect(entries.length).toBeGreaterThanOrEqual(4);
      for (const [key, text] of entries) {
        expect(`${key}: ${text}`).not.toMatch(GIVEAWAYS);
      }
    });
  }

  it('the decoy component takes its copy from the catalogues and hides it from screen readers', () => {
    const source = readFileSync('src/lib/components/DecoyNotes.svelte', 'utf8');
    // One button, labelled the same way the blank is - a screen reader
    // meets "Back to the app", never the fake notes.
    expect(source).toContain('aria-label={m.quick_exit_back()}');
    expect(source).toContain('aria-hidden="true"');
    expect(source).toContain('m.decoy_');
  });
});
