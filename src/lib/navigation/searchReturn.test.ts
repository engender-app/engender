import { expect, it } from 'vitest';
import { holdSearch, takeHeldSearch } from './searchReturn';

const snapshot = {
  query: 'cold', selectedTagIds: ['a'], selectedMoods: [2], startDate: '', endDate: '',
  hasNote: true, hasPhoto: false, starredOnly: false
};

it('hands back what search held, once', () => {
  expect(takeHeldSearch()).toBeNull();
  holdSearch(snapshot);
  expect(takeHeldSearch()).toEqual(snapshot);
  expect(takeHeldSearch()).toBeNull();
});
