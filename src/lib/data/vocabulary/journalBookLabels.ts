/* What each part of the journal book is called (phase 5 ticket 17), here
   rather than in journalBook.ts for the reason its neighbour gives: the
   wording speaks paraglide, and nothing the Node tier touches may import
   that (ADR-0016).

   One name per part, used both by the inclusion picker and by the heading
   that part prints under, so a person ticking "Milestones" gets a page that
   says the same word back. Most of them are the word its own screen already
   uses; only the two a book invents need a key of their own.

   A full Record over the inclusion keys: a part with no name here is a
   typecheck failure rather than a raw key printed on paper. */

import { m } from '$lib/paraglide/messages';
import type { JournalBookInclusionKey } from '$lib/data/journal/journalBook';

const PART_NAME: Record<JournalBookInclusionKey, () => string> = {
  entries: m.journal_book_part_entries,
  photos: m.photos_label,
  tags: m.tags_label,
  dysphoriaEuphoriaTags: m.journal_book_part_dysphoria_euphoria_tags,
  milestones: m.milestones,
  doubtEntries: m.doubt_title,
  sideEffects: m.side_effects,
  openingPage: m.journal_book_part_opening_page
};

/** What a part is called, in the picker and over its own pages alike. */
export const journalBookPartName = (key: JournalBookInclusionKey): string => PART_NAME[key]();
