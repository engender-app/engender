/* The reviewed-on guard (functional audit ticket 40). Each limit is checked
   on both sides of its edge with a fixture, so moving a limit or getting the
   month arithmetic wrong fails here rather than in a release log. */

import { INSTITUTIONS_REVIEWED_ON } from './data/roadmap';
import { expect, test } from 'vitest';
import { REVIEWED_CONTENT, REVIEW_LIMIT_MONTHS, reviewDueOn, staleContent, type ReviewedContent } from './reviewedContent';
import { wearSafetyFacts } from './data/vocabulary/wearLabels';

const fixture = (kind: ReviewedContent['kind'], reviewedOn: string): ReviewedContent => ({
  area: 'Fixture',
  item: kind,
  kind,
  reviewedOn
});

test('helpline and legal content go stale six months after review, literature after 24', () => {
  expect(REVIEW_LIMIT_MONTHS).toEqual({ helpline: 6, legal: 6, literature: 24 });
});

test.each([
  ['helpline', '2026-01-15', '2026-07-15', '2026-07-16'],
  ['legal', '2026-01-15', '2026-07-15', '2026-07-16'],
  ['literature', '2026-01-15', '2028-01-15', '2028-01-16']
] as const)('%s reviewed %s is flagged the day after %s', (kind, reviewedOn, lastGoodDay, firstStaleDay) => {
  const entry = fixture(kind, reviewedOn);

  expect(staleContent([entry], lastGoodDay)).toEqual([]);
  expect(staleContent([entry], firstStaleDay)).toEqual([{ ...entry, dueOn: lastGoodDay }]);
});

test('a review on the 31st falls due on the last day of a shorter month', () => {
  expect(reviewDueOn(fixture('helpline', '2026-08-31'))).toBe('2027-02-28');
  expect(reviewDueOn(fixture('literature', '2026-02-28'))).toBe('2028-02-28');
});

test('a reviewed-on value that is not an ISO day is always flagged', () => {
  const entry = fixture('literature', '19 August 2026');

  expect(staleContent([entry], '2026-08-20')).toEqual([{ ...entry, dueOn: null }]);
});

test('every shipped area is registered, with a real ISO day', () => {
  expect(new Set(REVIEWED_CONTENT.map((entry) => entry.area))).toEqual(new Set(['Onset bands', 'Resources', 'Roadmap', 'Voice', 'Wear']));
  for (const entry of REVIEWED_CONTENT) expect(reviewDueOn(entry), `${entry.area}: ${entry.item}`).not.toBeNull();
});

test('each shipped wear safety fact carries its own reviewed-on metadata in the guard', () => {
  const wearEntries = REVIEWED_CONTENT.filter((entry) => entry.area === 'Wear');
  for (const kind of ['binder', 'tucking', 'compression'] as const) {
    const facts = wearSafetyFacts(kind).facts;
    expect(facts).toHaveLength(3);
    for (const [index, fact] of facts.entries()) {
      expect(fact).toHaveProperty('reviewedOn');
      expect(wearEntries).toContainEqual(expect.objectContaining({
        item: `${kind} safety fact ${index + 1}`,
        reviewedOn: fact.reviewedOn
      }));
    }
  }
});

test('nothing shipped is past its limit on the day it was last reviewed', () => {
  const newest = REVIEWED_CONTENT.map((entry) => entry.reviewedOn).sort().at(-1)!;

  expect(staleContent(REVIEWED_CONTENT, newest)).toEqual([]);
});

/* Functional audit ticket 35: the institution notes were checked on a day
   of their own, so they fall due on their own and not with the court steps. */
test('the roadmap institutions are registered under their own reviewed-on day', () => {
  expect(REVIEWED_CONTENT).toContainEqual({ area: 'Roadmap', item: 'institutions to update after the ruling', kind: 'legal', reviewedOn: INSTITUTIONS_REVIEWED_ON });
});
