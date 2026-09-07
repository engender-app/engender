/* Home's recent entries, grouped into days (ux-carpet ticket 13).

   This used to cap what Home drew to five entries total and head a
   truncated day with how many it actually held ("3 that day" over one
   drawn) - a render limit rather than a narrower read, because cutting the
   query instead would make "how many did that day hold" unanswerable.

   The cap cut days in half more often than not: a day with two entries
   logged twelve hours apart is exactly the shape a timeline exists to show,
   and a home screen that had already spent its budget on the days before it
   drew one entry and a bare count instead - the read `entries.recentDays`
   already bounds by day, so every entry of a shown day draws now and
   nothing here trims a day's own list down further. A long run of entries
   inside the last five days makes Home longer that day; a quiet run keeps
   it short, same as it always has. */

import type { Entry } from './types';

export interface EntryDayGroup {
  epochDay: number;
  entries: Entry[];
}

/** The entries grouped by day, in the order the read handed them over.

    Not Home's alone (phase 5 ticket 22): a day, a search result set and the
    starred shelf all group the same way. */
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
