import { afterEach, expect, it, vi } from 'vitest';
import { handOverQuery, holdSearch, takeHandedQuery, takeHeldSearch, type SearchSnapshot } from './searchReturn';

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

afterEach(() => {
  takeHeldSearch();
  takeHandedQuery();
  vi.unstubAllGlobals();
});

it('hands back what search held, once', () => {
  stubStorage();
  expect(takeHeldSearch()).toBeNull();
  holdSearch(snapshot);
  expect(takeHeldSearch()).toEqual(snapshot);
  expect(takeHeldSearch()).toBeNull();
});

it('restores the held search even when storage is blocked', () => {
  vi.stubGlobal('sessionStorage', { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} });
  expect(() => holdSearch(snapshot)).not.toThrow();
  expect(takeHeldSearch()).toEqual(snapshot);
});

it('never writes held journal text to either Web Storage owner', () => {
  const localWrite = vi.fn();
  const sessionWrite = vi.fn();
  vi.stubGlobal('localStorage', { setItem: localWrite });
  vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: sessionWrite, removeItem() {} });
  holdSearch(snapshot);
  handOverQuery('private search');
  expect(localWrite).not.toHaveBeenCalled();
  expect(sessionWrite).not.toHaveBeenCalled();
});

it('keeps the snapshot independent of subsequent edits to its filters', () => {
  stubStorage();
  const changing = { ...snapshot, selectedTagIds: [...snapshot.selectedTagIds], selectedMoods: [...snapshot.selectedMoods] };
  holdSearch(changing);
  changing.query = 'changed';
  changing.selectedTagIds.push('b');
  changing.selectedMoods.push(4);
  expect(takeHeldSearch()).toEqual(snapshot);
});
