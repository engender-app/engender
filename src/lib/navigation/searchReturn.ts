/* What Search was showing when an entry was opened from it, held in memory
   so that coming back (editor Save, Delete or the back control) finds the
   same query and filters instead of an empty box. In memory only, never
   written anywhere: a query is the person's own typing and survives no
   longer than the tab does. */

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

let held: SearchSnapshot | null = null;

export function holdSearch(snapshot: SearchSnapshot): void {
  held = snapshot;
}

/** The held snapshot, once: reading it spends it. */
export function takeHeldSearch(): SearchSnapshot | null {
  const taken = held;
  held = null;
  return taken;
}
