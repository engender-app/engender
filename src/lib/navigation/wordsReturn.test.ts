import { expect, test } from 'vitest';
import { wordsReturnPath } from './wordsReturn';

test.each([null, '', 'https://example.org/', '//example.org/', 'javascript:alert(1)', '/\\example.org/', '/\texample.org/', '/\n/example.org/'])('refuses external or browser-normalized return: %s', (value) => {
  expect(wordsReturnPath(value)).toBeNull();
});

test.each(['/stats/words', '/stats/words?period=month', '/stats/words#reading'])('keeps same-origin return: %s', (value) => {
  expect(wordsReturnPath(value)).toBe(value);
});
