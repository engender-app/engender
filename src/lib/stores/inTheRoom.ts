/* What was jotted in the room, on its way to the debrief (phase 8 features
   ticket 60).

   Module state, deliberately, and nothing else. Ticket 60 adds no record of
   any kind: the answers are the debrief's, and they travel from the
   in-the-room screen to the entry editor's pre-fill the way a picked photo
   travels from the picker to the draft. Nothing is written to the journal
   here and nothing is mirrored to storage, so what somebody said in a
   consulting room does not outlive the process that heard it.

   Written as the person types rather than on the way out, so a back press
   in the middle of a visit loses nothing while the app is still running.

   Read non-destructively. Taking the offer, discarding the entry and taking
   the offer again has to pre-fill both times - a consumed-once read would
   silently hand the second attempt a blank note, which is the one thing the
   person could not get back.

   Keyed by appointment, because the pre-fill path is (checklists.ts, ticket
   58): answers held for one appointment must never surface in another's
   debrief. */
import type { DebriefAnswer } from '../data/journal/debriefNote';

let held: {
  appointmentId: string;
  answers: DebriefAnswer[];
  byItemId: Record<string, string>;
} | null = null;

/** Replaces whatever was held. A visit at a time: opening the screen for a
    different appointment is a different visit, and holding both would mean
    deciding later which one a debrief meant.

    `byItemId` is the same answers keyed by checklist item id rather than by
    question text - what a remounted room screen restores from (ticket 05,
    audit I2), since `answers` alone has already dropped the id a screen
    needs to put a jotting back under the field it was typed into. */
export function holdRoomAnswers(
  appointmentId: string,
  answers: DebriefAnswer[],
  byItemId: Record<string, string>
): void {
  held = { appointmentId, answers, byItemId };
}

/** What was jotted for this appointment, or nothing. */
export function roomAnswersFor(appointmentId: string): DebriefAnswer[] {
  return held?.appointmentId === appointmentId ? held.answers : [];
}

/** The held answers for `appointmentId`, narrowed to `itemIds` - what a
    remounted room screen puts back in its fields. Matched by checklist item
    id and nothing else, so an item edited, reordered or deleted since is
    never the reason an answer reappears under a different question: an id
    no longer in `itemIds` is dropped, not carried over to whatever now sits
    in its old place. */
export function restoreRoomAnswers(appointmentId: string, itemIds: string[]): Record<string, string> {
  const byItemId = held?.appointmentId === appointmentId ? held.byItemId : {};
  const restored: Record<string, string> = {};
  for (const id of itemIds) {
    if (byItemId[id] !== undefined) restored[id] = byItemId[id];
  }
  return restored;
}
