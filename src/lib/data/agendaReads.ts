/* Fetch the agenda's inputs (ADR-0074). Keep the projection in
   `agenda.ts` so its window and passed-slot rule can run without a
   driver. The three reads are the existing forward `getDayAhead`
   (ADR-0067), a week of past dose slots and today's appointments.
   Issue all three together before the first await so `liveQuery`
   discovers every dependency in its first run. */

import { agenda, agendaPassedWindow, agendaWindow, type Agenda, type AgendaInput } from './agenda';
import type { DayAheadArea } from './journal/dayAhead';
import type { DosesArea } from './journal/doses';
import type { AppointmentsArea } from './journal/appointments';

/** The areas the agenda reads: the ones `openJournal` already built, so
    every fact arrives through the same method its own screen would ask
    (the discipline `lastWrite.ts`, `offers.ts` and `comingBackReads.ts` all
    keep). */
export interface AgendaAreas {
  dayAhead: DayAheadArea;
  doses: DosesArea;
  appointments: AppointmentsArea;
}

/** Read the agenda's facts without waiting for the live tiles to decide
    whether their dose panel is drawn. */
export async function readAgenda(
  areas: AgendaAreas,
  todayEpochDay: number
): Promise<AgendaInput | null> {
  const ahead = agendaWindow(todayEpochDay);
  const behind = agendaPassedWindow(todayEpochDay);
  const [marks, doses, todayAppointments] = await Promise.all([
    areas.dayAhead.getDayAhead(ahead.fromEpochDay, ahead.toEpochDay, todayEpochDay),
    /* `getComparison` is what resolves the episode in effect, its schedule
       and its pauses, so this file asks one question instead of assembling
       four - the same reason the return surface asks it. */
    areas.doses.getComparison(behind),
    /* Today's rows, not the table: one day is all the today row names. */
    areas.appointments.getDayRecords(todayEpochDay)
  ]);

  return { todayEpochDay, marks, doses, todayAppointments };
}

/** Withhold the `doseSlot` kind while Today's dose panel is drawn. Filter
    before capping, so a withheld dose never takes another row's room. The
    panel names every regimen that produces dose-slot marks,
    so drawn is the whole condition.

    Every other kind is drawn: the five per-kind switches went in
    functional-audit ticket 14. */
export function projectAgenda(
  facts: AgendaInput | null | undefined,
  dosePanelDrawn = false
): Agenda | null {
  if (!facts) return null;
  if (!dosePanelDrawn) return agenda(facts);
  return agenda({ ...facts, marks: facts.marks.filter((mark) => mark.kind !== 'doseSlot') });
}
