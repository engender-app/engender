import { expect, it } from 'vitest';
import en from '../../../../messages/en.json';
import pl from '../../../../messages/pl.json';
import { BUILT_IN_TAG_GROUPS } from './builtins';
import { tagLabels } from './import-labels';

it('matches every built-in tag in both supported languages', () => {
  const tags = BUILT_IN_TAG_GROUPS.flatMap((group) => [...group.tags]);
  expect(tags.length).toBeGreaterThan(0);
  for (const tag of tags) {
    const messageKey = `tag_${tag.replaceAll('-', '_')}`;
    const english = (en as Record<string, unknown>)[messageKey];
    const polish = (pl as Record<string, unknown>)[messageKey];
    for (const text of [english, polish]) {
      expect(typeof text).toBe('string');
      expect(text).not.toMatch(/[{}]/);
    }
    expect(tagLabels(tag)).toEqual([english, polish]);
  }
  expect(tagLabels('custom-tag')).toEqual(['custom-tag']);
});
