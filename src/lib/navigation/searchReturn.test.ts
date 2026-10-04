import { afterEach, expect, it, vi } from 'vitest';
import { holdSearch, takeHeldSearch, type SearchSnapshot } from './searchReturn';

const snapshot: SearchSnapshot = {
  query: 'cold', selectedTagIds: ['a'], selectedMoods: [2], startDate: '', endDate: '',
  hasNote: true, hasPhoto: false, starredOnly: false
};

function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k)
  });
}

afterEach(() => vi.unstubAllGlobals());

it('hands back what search held, once', () => {
  stubStorage();
  expect(takeHeldSearch()).toBeNull();
  holdSearch(snapshot);
  expect(takeHeldSearch()).toEqual(snapshot);
  expect(takeHeldSearch()).toBeNull();
});

it('comes back empty rather than throwing where there is no storage', () => {
  vi.stubGlobal('sessionStorage', { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} });
  expect(() => holdSearch(snapshot)).not.toThrow();
  expect(takeHeldSearch()).toBeNull();
});
