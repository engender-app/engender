/* The one thing a demo seed needs that is not a day (phase 8 features
   ticket 05).

   Every seed in this module is written relative to a `today` it is handed,
   which is what lets one of them build a journal that stops five weeks ago
   - the state the return surface exists for, and the only way to look at
   that screen in a review build. A handful of rows are timestamps rather
   than days, though: the sample entry a few hours back, a personal effect
   opened four days ago, a wear session still running. Those read a clock,
   and a clock does not move when the seed's anchor does.

   So: the moment inside the anchor day that stands in for "now". The real
   clock while the anchor is today, which is every seed but one and leaves
   those rows byte-identical to what they were; the last moment of the
   anchor day otherwise, so a row written "two hours before now" lands two
   hours before the end of the day the journal stops on rather than in the
   future. */

import { startOfDayTimestamp } from '../epochDay';

export function demoNow(anchorEpochDay: number): number {
  return Math.min(Date.now(), startOfDayTimestamp(anchorEpochDay + 1) - 1);
}
