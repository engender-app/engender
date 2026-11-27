/* Hold in-the-room answers only in module memory, keyed by appointment.
   Write them as the person types so Back does not lose them during the
   session. No journal write or storage mirror happens here.

   The debrief reads a matching appointment non-destructively. Discarding
   an attempted entry and reopening the offer still prefills the note.
   Two appointments on one day keep separate answers. */
import type { DebriefAnswer } from '../data/journal/debriefNote';
import { forgetOnLock } from '../lock/forget-content';

interface HeldRoomAnswers {
  appointmentId: string;
  answers: DebriefAnswer[];
  byItemId: Record<string, string>;
}

const held = new Map<string, HeldRoomAnswers>();

// Like Journal's browsing state, question positions belong to history visits.
// Appointment identity prevents a reused depth from restoring another room.
const visits = new Map<number, { appointmentId: string | null; index: number }>();

export function rememberRoomVisit(depth: number, appointmentId: string | null, index: number): void {
  visits.set(depth, { appointmentId, index });
}

export function restoreRoomVisit(depth: number, returning: boolean, appointmentId: string | null): number {
  if (!returning) visits.delete(depth);
  const visit = visits.get(depth);
  return visit?.appointmentId === appointmentId ? visit.index : 0;
}

/** Holds this appointment's answers, replacing only its own earlier entry. Still
    process-lifetime module state: nothing is written to the journal here and nothing is
    mirrored to storage, so what somebody said in a consulting room does not outlive the
    process that heard it.

    `byItemId` is the same answers keyed by checklist item id rather than by question text -
    what a remounted room screen restores from, since `answers` alone has already dropped
    the id a screen needs to put a jotting back under the field it was typed into. */
export function holdRoomAnswers(entry: HeldRoomAnswers): void {
  held.set(entry.appointmentId, entry);
}

/** Lets go of everything jotted, for every appointment. A lock takes it with the rest of the journal: what was said
    in a consulting room is exactly what a locked app should not still be
    holding. */
function forgetRoomAnswers(): void {
  held.clear();
  visits.clear();
}
forgetOnLock(forgetRoomAnswers);

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
