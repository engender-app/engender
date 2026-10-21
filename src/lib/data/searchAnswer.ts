/* What a search answers beside its entries: the starred photos and the one
   count under the results. Kept out of the screen so the contract suite asks
   the same helpers the screen does. */

import type { EntrySearchFilters } from './journal/entries';
import type { PhotoLibraryArea } from './journal/photoLibrary';
import type { LibraryPhoto } from './photos/library';

/** The starred photos an answer carries beside its entries: every starred
    photo when Starred is on, none otherwise. The photo library's own read,
    not narrowed by the query or the entry filters, which the screen says in
    a line above the grid. */
export function starredPhotosAsked(
  photoLibrary: Pick<PhotoLibraryArea, 'starred'>,
  filters: EntrySearchFilters
): Promise<LibraryPhoto[]> {
  return filters.starred ? photoLibrary.starred() : Promise.resolve([]);
}

/** The one count under an answer: entries, records from elsewhere and
    starred photos together, so the number describes everything shown. */
export function answerTotal(entries: number, elsewhere: number, starredPhotos: number): number {
  return entries + elsewhere + starredPhotos;
}
