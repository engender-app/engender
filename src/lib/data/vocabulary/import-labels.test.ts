import { expect, it } from 'vitest';
import en from '../../../../messages/en.json';
import pl from '../../../../messages/pl.json';
import { BUILT_IN_TAG_GROUPS } from './builtins';
import { familyOf } from './emotionFamilies';
import { tagLabels } from './import-labels';

it('matches established Daylio tag aliases in both supported languages', () => {
  const tags = BUILT_IN_TAG_GROUPS.flatMap((group) => [...group.tags]);
  expect(tags.length).toBeGreaterThan(0);
  for (const tag of tags) {
    // Daylio keeps treating new emotion names as the person's imported tags.
    if (tag === 'e-angry' || (tag !== 'e-hopeful' && familyOf(tag))) {
      expect(tagLabels(tag)).toEqual([tag]);
      continue;
    }
    const messageKey = `tag_${tag.replaceAll('-', '_')}`;
    const english = (en as Record<string, unknown>)[messageKey];
    const polish = (pl as Record<string, unknown>)[messageKey];
    for (const text of [english, polish]) {
      expect(typeof text).toBe('string');
      expect(text).not.toMatch(/[{}]/);
    }
    expect(tagLabels(tag).slice(0, 2)).toEqual([english, polish]);
  }
  expect(tagLabels('custom-tag')).toEqual(['custom-tag']);
});

it('still matches the names the two pronoun tags had before they followed the tally', () => {
  expect(tagLabels('g-gendered-ok')).toEqual(expect.arrayContaining(['gendered correctly', 'właściwe formy']));
  expect(tagLabels('g-misgendered')).toContain('niewłaściwe formy');
});
