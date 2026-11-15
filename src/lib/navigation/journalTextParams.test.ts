import { expect, test } from 'vitest';
import { arriveWithoutJournalText, takeLegacyCareDrug, takeLegacyQuery, withoutJournalText } from './journalTextParams';
import { forgetJournalContent } from '../lock/forget-content';

const at = (path: string) => new URL(path, 'https://engender.test');
const href = (url: URL | null) => url && url.pathname + url.search + url.hash;

test('an address with no journal text is left alone', () => {
  expect(withoutJournalText(at('/care/doses?episode=e&date=20000#d-1'))).toBeNull();
});

test('drug, lane and q come out, nested return paths included, and the rest stays', () => {
  expect(href(withoutJournalText(at('/care/doses?add=1&drug=Canarydiol&lane=Canarydiol&date=20000#d-1'))))
    .toBe('/care/doses?add=1&date=20000#d-1');
  const nested = withoutJournalText(at(`/entry/7?from=${encodeURIComponent('/search?q=Canary+words&starred=1')}`));
  expect(nested?.searchParams.get('from')).toBe('/search?starred=1');
  expect(href(withoutJournalText(at('/search?q=Canary')))).toBe('/search');
});

test('an old Care address holds its medication for the screen, once, until a lock', () => {
  expect(href(arriveWithoutJournalText(at('/care/doses?add=1&drug=Canarydiol')))).toBe('/care/doses?add=1');
  expect(takeLegacyCareDrug()).toBe('Canarydiol');
  expect(takeLegacyCareDrug()).toBeNull();

  arriveWithoutJournalText(at('/care?lane=Canarydiol'));
  forgetJournalContent();
  expect(takeLegacyCareDrug()).toBeNull();
});

test('a Care address that already names its episode holds nothing', () => {
  arriveWithoutJournalText(at('/care/doses?episode=e&drug=Canarydiol'));
  expect(takeLegacyCareDrug()).toBeNull();
});

test('a typed search address hands its query to the search screen in memory', () => {
  expect(href(arriveWithoutJournalText(at('/search?q=Canary')))).toBe('/search');
  expect(takeLegacyQuery()).toBe('Canary');
  expect(takeLegacyQuery()).toBeNull();
});
