import { describe, expect, it, beforeEach } from 'vitest';
import { MAX_ENTRIES, listRecentSearches, recordRecentSearch } from './recentSearches.ts';

function createFakeStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return store.size;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    }
  } as Storage;
}

describe('recentSearches', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createFakeStorage();
  });

  it('is empty until something is recorded', () => {
    expect(listRecentSearches(storage)).toEqual([]);
  });

  it('records most-recent first', () => {
    recordRecentSearch('euphoria', storage);
    recordRecentSearch('therapy', storage);
    expect(listRecentSearches(storage)).toEqual(['therapy', 'euphoria']);
  });

  it('moves a repeated search to the front instead of duplicating it', () => {
    recordRecentSearch('euphoria', storage);
    recordRecentSearch('therapy', storage);
    recordRecentSearch('euphoria', storage);
    expect(listRecentSearches(storage)).toEqual(['euphoria', 'therapy']);
  });

  it(`keeps only the last ${MAX_ENTRIES}`, () => {
    for (let i = 0; i < MAX_ENTRIES + 2; i++) recordRecentSearch(`term-${i}`, storage);
    const list = listRecentSearches(storage);
    expect(list).toHaveLength(MAX_ENTRIES);
    expect(list[0]).toBe(`term-${MAX_ENTRIES + 1}`);
    expect(list).not.toContain('term-0');
    expect(list).not.toContain('term-1');
  });

  it('records nothing for a blank or whitespace-only term', () => {
    recordRecentSearch('   ', storage);
    recordRecentSearch('', storage);
    expect(listRecentSearches(storage)).toEqual([]);
  });

  it('trims what it stores', () => {
    recordRecentSearch('  euphoria  ', storage);
    expect(listRecentSearches(storage)).toEqual(['euphoria']);
  });

  it('is empty rather than throwing when the stored value is not a JSON array of strings', () => {
    storage.setItem('engender-recent-searches', '{"not":"an array"}');
    expect(listRecentSearches(storage)).toEqual([]);
    storage.setItem('engender-recent-searches', 'not even json');
    expect(listRecentSearches(storage)).toEqual([]);
  });
});
