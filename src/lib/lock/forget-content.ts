/* Journal content the page holds outside the database, which a lock takes
   with it (after-release ticket 10; audit L09-02, L09-03, SEC-08).

   Closing the database and releasing the key leaves the journal itself
   unreadable from this tab, but a few things were copied out of it on the
   way: the reads' last answers (ux-carpet 201), a search held for the way
   back from an entry - in sessionStorage, in plaintext - and a query on its
   way from More, the answers jotted in the room before their debrief, and
   the waveform bars of recordings already played. Each is cheap to
   recompute or deliberately short-lived, so a lock drops all of them rather
   than weighing which are sensitive. */

import { forgetLastResults } from '../data/live/lastResults.ts';
import { forgetSearch } from '../navigation/searchReturn.ts';
import { forgetRoomAnswers } from '../stores/inTheRoom.ts';
import { forgetPeaks } from '../media/peaks.ts';

export function forgetJournalContent(): void {
  forgetLastResults();
  forgetSearch();
  forgetRoomAnswers();
  forgetPeaks();
}
