/* A saved question and a search's filters are the same shape read two ways
   (phase 8 features ticket 06). `/search` already builds `EntrySearchFilters`
   out of five pieces of state; a saved question just keeps those five past
   the screen closing. Both directions live here, next to searchQuery.ts,
   so nowhere else has to know a saved question is a search at all - the
   run reads a saved question with `entrySearchFiltersOf` and calls
   `entries.searchEntries`/`countSearchMatches` exactly as `/search` does,
   which is what makes their results the same read rather than a second
   computation of it (the ticket's own acceptance criterion). */

import type { EntrySearchFilters } from './journal/entries';
import type { SavedQuestion } from './types';

/** The filters a saved question was kept under, in the shape
    `searchEntries`/`countSearchMatches` already take. The free-text query
    itself is `queryText` on the same row, passed alongside these rather than
    folded in - tag ids matched by *typing* stay a live lookup at run time
    (searchQuery.ts's `tagIdsMatching`), the same as an ad hoc search. */
export function entrySearchFiltersOf(
  saved: Pick<SavedQuestion, 'tagIds' | 'moods' | 'startEpochDay' | 'endEpochDay' | 'hasNote' | 'hasPhoto'>
): EntrySearchFilters {
  return {
    tagIds: saved.tagIds,
    moods: saved.moods,
    startEpochDay: saved.startEpochDay,
    endEpochDay: saved.endEpochDay,
    hasNote: saved.hasNote,
    hasPhoto: saved.hasPhoto
  };
}

/** A saved question's row, minus its name and id, from what `/search` has
    on screen when "save this question" is offered. Every filter defaults
    to its off state rather than staying undefined - the row's columns are
    not null, and a filter the screen never turned on is not one that
    should read as missing when the question is asked again. */
export function savedQuestionInputOf(
  name: string,
  queryText: string,
  filters: EntrySearchFilters
): Omit<SavedQuestion, 'id'> {
  return {
    name,
    queryText,
    tagIds: filters.tagIds ?? [],
    moods: filters.moods ?? [],
    startEpochDay: filters.startEpochDay ?? null,
    endEpochDay: filters.endEpochDay ?? null,
    hasNote: filters.hasNote ?? false,
    hasPhoto: filters.hasPhoto ?? false
  };
}
