/* What Search was showing when an entry was opened from it, held for the
   way back (editor Save, Delete or the back control) so the list returns
   with the same query and filters instead of an empty box.

   Kept in sessionStorage, not in memory: the editor can be reloaded before
   it is left, and the person's own typing should still be there. It lives
   no longer than the tab, and reading it spends it. */

export interface SearchSnapshot {
  query: string;
  selectedTagIds: string[];
  selectedMoods: number[];
  startDate: string;
  endDate: string;
  hasNote: boolean;
  hasPhoto: boolean;
  starredOnly: boolean;
}

export const EMPTY_SEARCH: SearchSnapshot = {
  query: '', selectedTagIds: [], selectedMoods: [], startDate: '', endDate: '',
  hasNote: false, hasPhoto: false, starredOnly: false
};

const KEY = 'engender-search-return';

export function holdSearch(snapshot: SearchSnapshot): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch { /* no storage: the search comes back empty */ }
}

/** The held snapshot, once: reading it spends it. */
export function takeHeldSearch(): SearchSnapshot | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return raw ? { ...EMPTY_SEARCH, ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}
