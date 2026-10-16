import { forgetOnLock } from '../lock/forget-content';

export interface JournalVisit {
  year: number;
  month: number;
  recentDaysLimit: number;
}

// The app's history depth identifies visits, as it does for borrowed tabs.
// Keep these in memory so a lock or reload drops the browsing state.
const visits = new Map<number, JournalVisit>();

export function rememberJournalVisit(depth: number, state: JournalVisit): void {
  visits.set(depth, { ...state });
}

export function restoreJournalVisit(depth: number, returning: boolean): JournalVisit | null {
  if (!returning) visits.delete(depth);
  return visits.get(depth) ?? null;
}

forgetOnLock(() => visits.clear());
