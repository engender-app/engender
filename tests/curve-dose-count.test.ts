import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Runtime wording and both rendered branches are covered by curve-dose-count-check.mjs.
describe('curve dose-count catalogue contract', () => {
  for (const locale of ['en', 'pl']) {
    it(`${locale} selects plural forms from the numeric count`, () => {
      const catalogue = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'));
      const variants = catalogue.curve_no_curve_note;
      expect(Array.isArray(variants)).toBe(true);
      expect(variants[0].declarations).toEqual(['input count', 'local countPlural = count: plural']);
      expect(variants[0].selectors).toEqual(['countPlural']);
      for (const category of locale === 'en' ? ['one', 'other'] : ['one', 'few', 'many', 'other']) {
        expect(variants[0].match[`countPlural=${category}`]).toContain('{count}');
      }
    });
  }
});
