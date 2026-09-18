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
   debrief. One entry per appointment rather than one held at a time
   (ticket 12, audit I3): the one-at-a-time rule assumed the room had to
   guess which visit a day meant, and the room now asks - so a day with
   two visits holds two answer sets, and which one a debrief means is
   settled by the appointment id the deep link already carries. */
import type { DebriefAnswer } from '../data/journal/debriefNote';

interface HeldRoomAnswers {
  appointmentId: string;
  answers: DebriefAnswer[];
  byItemId: Record<string, string>;
}

const held = new Map<string, HeldRoomAnswers>();

/** Holds this appointment's answers, replacing only its own earlier entry.
    Still process-lifetime module state: nothing is written to the journal
    here and nothing is mirrored to storage, so what somebody said in a
    consulting room does not outlive the process that heard it.

    `byItemId` is the same answers keyed by checklist item id rather than by
    question text - what a remounted room screen restores from (ticket 05,
    audit I2), since `answers` alone has already dropped the id a screen
    needs to put a jotting back under the field it was typed into. */
export function holdRoomAnswers(entry: HeldRoomAnswers): void {
  held.set(entry.appointmentId, entry);
}

/** What was jotted for this appointment, or nothing. */
export function roomAnswersFor(appointmentId: string): DebriefAnswer[] {
  return held.get(appointmentId)?.answers ?? [];
}

/** The held answers for `appointmentId`, narrowed to `itemIds` - what a
    remounted room screen puts back in its fields. Matched by checklist item
    id and nothing else, so an item edited, reordered or deleted since is
    never the reason an answer reappears under a different question: an id
    no longer in `itemIds` is dropped, not carried over to whatever now sits
    in its old place. */
export function restoreRoomAnswers(appointmentId: string, itemIds: string[]): Record<string, string> {
  const byItemId = held.get(appointmentId)?.byItemId ?? {};
  const restored: Record<string, string> = {};
  for (const id of itemIds) {
    if (byItemId[id] !== undefined) restored[id] = byItemId[id];
  }
  return restored;
}
