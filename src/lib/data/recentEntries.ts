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

export interface EntryDayGroup {
  epochDay: number;
  entries: Entry[];
}

/** The entries grouped by day, uncapped, in the order the read handed them
    over.

    Its own export because Home is no longer the only screen that draws days
    (phase 5 ticket 22): a day, a search result set and the starred shelf all
    group the same way and none of the other three has a cap. What they also
    do not have is Home's `dayCount` - a search hit list can say how many
    entries of a day *matched* and not how many that day holds, and a bar
    reading "3 that day" over three of five would be the filter describing
    itself. So the count belongs to the capped form below and not here. */
export function entryDayGroups(entries: Entry[]): EntryDayGroup[] {
  const groups: EntryDayGroup[] = [];
  const byDay = new Map<number, EntryDayGroup>();
  for (const entry of entries) {
    let group = byDay.get(entry.epochDay);
    if (!group) {
      group = { epochDay: entry.epochDay, entries: [] };
      byDay.set(entry.epochDay, group);
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}

export function recentDayGroups(entries: Entry[], cap: number): RecentDayGroup[] {
  const out: RecentDayGroup[] = [];
  let drawn = 0;
  for (const group of entryDayGroups(entries)) {
    const draw = group.entries.slice(0, Math.max(0, cap - drawn));
    drawn += draw.length;
    // A day the cap never reached is a heading with nothing under it.
    if (draw.length) out.push({ epochDay: group.epochDay, entries: draw, dayCount: group.entries.length });
  }
  return out;
}

/** Icon names for the media an entry carries, in the order a row draws them.

    A summary of a day has to say that an entry is a photo and four tags,
    or it makes that entry look like an empty one next to a note. */
export function entryMarks(entry: Entry): string[] {
  return [
    entry.photos?.length ? 'image' : null,
    entry.recordings?.length ? 'mic' : null,
    entry.videos?.length ? 'video' : null
  ].filter((name): name is string => name != null);
}
