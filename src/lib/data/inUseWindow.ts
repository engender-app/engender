/* When an opened container's in-use window ends (phase 8 features ticket 13,
   "What is open, and until when"). Pure, above the journal seam beside
   stockProjection.ts.

   An in-use window in days and an explicit end date are two different
   things a label can say, stored as typed rather than one derived from the
   other (the ticket's own reasoning). This module never derives one from
   the other either: it only combines whichever was typed into a single day
   to display, for the container whose opened date and window this is.

   Out of scope, per the ticket: no verdict on a container past its window.
   isPastInUseWindow answers a plain "on or after this day", never "unsafe"
   or "expired" - nothing here decides what that means. */

export interface InUseWindow {
  openedEpochDay: number;
  /** As typed, or null when an end date was typed instead. */
  inUseWindowDays: number | null;
  /** As typed, or null when a window in days was typed instead. */
  inUseEndEpochDay: number | null;
}

/** `inUseEndEpochDay` as typed, or `openedEpochDay + inUseWindowDays` when a
    window in days was typed instead. Null when neither was typed. */
export function inUseWindowEndEpochDay(window: InUseWindow): number | null {
  if (window.inUseEndEpochDay !== null) return window.inUseEndEpochDay;
  if (window.inUseWindowDays !== null) return window.openedEpochDay + window.inUseWindowDays;
  return null;
}

/** Whether `asOfEpochDay` is past the day this window projects to - the end
    day itself is still within it. False when there is nothing to project:
    neither a window in days nor an end date was typed. */
export function isPastInUseWindow(window: InUseWindow, asOfEpochDay: number): boolean {
  const end = inUseWindowEndEpochDay(window);
  return end !== null && asOfEpochDay > end;
}
