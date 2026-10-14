/* What Search was showing when an entry was opened from it, held for the
   way back (editor Save, Delete or the back control) so the list returns
   with the same query and filters instead of an empty box.

   Kept in memory: Web Storage can leave search text on disk after a lock.
   Reading spends it; a lock or reload drops it along with the query More
   hands over below. */

import { forgetOnLock } from '../lock/forget-content.ts';

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

let heldSearch: SearchSnapshot | null = null;

export function holdSearch(snapshot: SearchSnapshot): void {
  heldSearch = {
    ...snapshot,
    selectedTagIds: [...snapshot.selectedTagIds],
    selectedMoods: [...snapshot.selectedMoods]
  };
}

/** The held snapshot, once: reading it spends it. */
export function takeHeldSearch(): SearchSnapshot | null {
  const snapshot = heldSearch;
  heldSearch = null;
  return snapshot;
}

/* A query typed into More's search, on its way to the Search screen
   (after-release ticket 10, audit L09-02). It used to travel in the
   address as `/search?q=`, which put whatever was typed into the
   browser's history for good. Held in memory instead, for the one
   navigation it is for, and taken by a lock like the snapshot above. */
let handedQuery: string | null = null;

export function handOverQuery(query: string): void {
  handedQuery = query;
}

/** The handed-over query, once. */
export function takeHandedQuery(): string | null {
  const query = handedQuery;
  handedQuery = null;
  return query;
}

/* Both searches belong to this unlocked page only. */
forgetOnLock(() => {
  heldSearch = null;
  handedQuery = null;
});
