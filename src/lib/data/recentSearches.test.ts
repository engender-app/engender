import { describe, expect, it, vi } from 'vitest';
import { purgeLegacyRecentSearches } from './recentSearches.ts';

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

/* Every ordering/dedup/limit test imports the module fresh: `recent` is
   module state, session memory rather than a fake store, which leaves no
   other way to put it back between tests. */
async function freshModule() {
  vi.resetModules();
  return import('./recentSearches.ts');
}

describe('recentSearches', () => {
  it('is empty until something is recorded', async () => {
    const { listRecentSearches } = await freshModule();
    expect(listRecentSearches()).toEqual([]);
  });

  it('records most-recent first', async () => {
    const { listRecentSearches, recordRecentSearch } = await freshModule();
    recordRecentSearch('euphoria');
    recordRecentSearch('therapy');
    expect(listRecentSearches()).toEqual(['therapy', 'euphoria']);
  });

  it('moves a repeated search to the front instead of duplicating it', async () => {
    const { listRecentSearches, recordRecentSearch } = await freshModule();
    recordRecentSearch('euphoria');
    recordRecentSearch('therapy');
    recordRecentSearch('euphoria');
    expect(listRecentSearches()).toEqual(['euphoria', 'therapy']);
  });

  it('keeps only the last MAX_ENTRIES', async () => {
    const { MAX_ENTRIES, listRecentSearches, recordRecentSearch } = await freshModule();
    for (let i = 0; i < MAX_ENTRIES + 2; i++) recordRecentSearch(`term-${i}`);
    const list = listRecentSearches();
    expect(list).toHaveLength(MAX_ENTRIES);
    expect(list[0]).toBe(`term-${MAX_ENTRIES + 1}`);
    expect(list).not.toContain('term-0');
    expect(list).not.toContain('term-1');
  });

  it('records nothing for a blank or whitespace-only term', async () => {
    const { listRecentSearches, recordRecentSearch } = await freshModule();
    recordRecentSearch('   ');
    recordRecentSearch('');
    expect(listRecentSearches()).toEqual([]);
  });

  it('trims what it stores', async () => {
    const { listRecentSearches, recordRecentSearch } = await freshModule();
    recordRecentSearch('  euphoria  ');
    expect(listRecentSearches()).toEqual(['euphoria']);
  });

  it('purges the legacy plaintext key from a given store', () => {
    const storage = createFakeStorage({ 'engender-recent-searches': JSON.stringify(['euphoria']) });
    purgeLegacyRecentSearches(storage);
    expect(storage.getItem('engender-recent-searches')).toBeNull();
  });

  it('does nothing when the legacy key is already gone', () => {
    const storage = createFakeStorage();
    expect(() => purgeLegacyRecentSearches(storage)).not.toThrow();
    expect(storage.getItem('engender-recent-searches')).toBeNull();
  });
});
