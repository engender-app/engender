/* Anchor demo timestamps to the same day as seeded dates. Use
   the real clock when the anchor is today. Otherwise use the
   last moment of the anchor day so relative entries stay inside
   a journal seeded to stop weeks ago. */

import { startOfDayTimestamp } from '../epochDay';

export function demoNow(anchorEpochDay: number): number {
  return Math.min(Date.now(), startOfDayTimestamp(anchorEpochDay + 1) - 1);
}
