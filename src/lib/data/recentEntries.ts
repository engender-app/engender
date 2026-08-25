/* Home's recent entries, grouped into days and capped (spec 08).

   The read behind this returns every entry of the last five logged days
   with no row limit, so a day with a lot logged turned Home into a very
   long scroll of everything the app can say. The cap is a render limit
   rather than a narrower read: the rest are one tap away on the calendar,
   and cutting the query instead would make "how many did that day hold"
   unanswerable - which is the one number the day bar has to say.

   That is why a group carries both. `entries` is what Home draws and
   `dayCount` is what the day actually holds, so the bar reads "3 that day"
   whether or not the cap took the third one. A count that shrank with the
   cap would be the cap describing itself.

   Day order and within-day order are the read's own (entries.recentDays
   returns whole days, newest day first): a second sort here would be a
   second place deciding how this app orders a journal. */

import type { Entry } from './types';

/** How many entries Home draws before pointing at the calendar.

    Five, which is the same number of days the read asks for, and comes out
    at about a screen of day cards at 390px with the week strip and the
    milestones above them. */
export const RECENT_ENTRY_CAP = 5;

export interface RecentDayGroup {
  epochDay: number;
  /** The entries to draw, already cut to whatever is left of the cap. */
  entries: Entry[];
  /** How many entries that day holds in total, cap or no cap. */
  dayCount: number;
}

export function recentDayGroups(entries: Entry[], cap: number): RecentDayGroup[] {
  const groups: RecentDayGroup[] = [];
  const byDay = new Map<number, RecentDayGroup>();
  let drawn = 0;

  for (const entry of entries) {
    let group = byDay.get(entry.epochDay);
    if (!group) {
      group = { epochDay: entry.epochDay, entries: [], dayCount: 0 };
      byDay.set(entry.epochDay, group);
      groups.push(group);
    }
    group.dayCount++;
    if (drawn < cap) {
      group.entries.push(entry);
      drawn++;
    }
  }

  // A day the cap never reached is a heading with nothing under it.
  return groups.filter((group) => group.entries.length > 0);
}
