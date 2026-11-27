/* Whether Home and the appointment screens offer the appointment debrief
   (ADR-0066). Pure, so the rule is provable without the
   journal. */

/** What the offer predicate below needs to know (ADR-0066): the
    most recent past appointment (appointments.ts's
    `mostRecentPastAppointment`), the standing prep list's own state read
    off the standalone checklist (checklists.ts), scoped to that same
    appointment. */
/* DebriefOfferState stays exported only for its own test. */
export interface DebriefOfferState {
  /** The most recent past appointment's id, or null when there is none -
      "strictly past" is already baked in by the selector that produced
      this, so the predicate below has no clock of its own to consult. */
  appointmentId: string | null;
  /** How many prep questions are on the list - an appointment with none
      produces no offer, the ticket's own line. */
  itemCount: number;
  /** Whether the offer for `appointmentId` was dismissed
      (`getDebriefState`, checklists.ts) - already resolved against this
      exact id, so a dismissal recorded for a since-superseded appointment
      reads as not-dismissed here. */
  dismissed: boolean;
  /** The entry that debriefs `appointmentId`, or null - same id-scoped
      resolution as `dismissed`. */
  debriefEntryId: number | null;
}

/** Whether Home should offer the debrief right now: there is a
    most recent past appointment, there was something to prepare for, and
    this specific appointment has not already been resolved one way or the
    other. Once, whether taken or dismissed (What to Build #1): the offer
    never reappears for the same appointment, and a newer past appointment
    is what re-arms it - `appointmentId` moving on is itself
    the re-arm, there is no date to change or column to clear. */
export function debriefOfferVisible(state: DebriefOfferState): boolean {
  if (state.appointmentId == null) return false;
  if (state.itemCount === 0) return false;
  if (state.dismissed) return false;
  if (state.debriefEntryId !== null) return false;
  return true;
}
