/* When the next scheduled fixed-position hair photo is due (phase 4 ticket
   09). Pure, kept above the journal seam beside doseSchedule.ts: nothing
   here reads a clock or a database, and no due date is stored (ADR-0010) -
   the hair-progress screen recomputes it from the anchor and the last photo
   taken on every read.

   Progression here is slow enough that unscheduled photos would under-
   sample it (ticket 09), so a photo is due on a fixed recurring interval
   rather than logged ad hoc. The interval is a plain constant, not a
   per-person setting: the ticket does not ask for one to be configurable,
   and inventing that knob would be exactly the speculative flexibility
   CLAUDE.md's simplicity rule warns against. */

export const HAIR_PHOTO_INTERVAL_DAYS = 28;

/** The next due day, or null with no anchor yet - there is nothing to count
    weeks since (ticket 09's "unanchored" case: staging and photo capture
    still work, just without this framing).

    With no photo taken yet, the first is due on the anchor day itself - a
    baseline shot as soon as treatment has a start date. After that, due is
    `HAIR_PHOTO_INTERVAL_DAYS` after the last photo actually taken, not
    stepped from the anchor: stepping from the anchor would leave every
    later photo perpetually "overdue" the moment one photo lands late, the
    same reason doseSchedule.ts's expectedSlots does not re-anchor to when a
    schedule was edited. */
export function nextHairPhotoDueEpochDay(anchorEpochDay: number | null, lastPhotoEpochDay: number | null): number | null {
  if (anchorEpochDay === null) return null;
  if (lastPhotoEpochDay === null) return anchorEpochDay;
  return lastPhotoEpochDay + HAIR_PHOTO_INTERVAL_DAYS;
}

/** Whether a fixed-position photo is due as of `todayEpochDay`. False with
    no anchor yet, the same as nextHairPhotoDueEpochDay returning null. */
export function isHairPhotoDue(anchorEpochDay: number | null, lastPhotoEpochDay: number | null, todayEpochDay: number): boolean {
  const due = nextHairPhotoDueEpochDay(anchorEpochDay, lastPhotoEpochDay);
  return due !== null && todayEpochDay >= due;
}
