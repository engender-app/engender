/* The reads behind the agenda (phase 10 redesign ticket 04, ADR-0074).

   Split from `agenda.ts` for the reason `comingBackReads.ts` is split from
   `comingBack.ts`: the projection is where the window, the cap and the
   passed-slot rule are, and it wants a Node test with no driver, so it
   takes rows. This file is what fetches them, in one place, so every
   surface that ever asks what is coming asks the same two questions.

   Three reads, and only one of them looks forward. `dayAhead.getDayAhead`
   is the app's one forward read (ADR-0067) and nothing here adds a second:
   Today is its seventh consumer, not a new mechanism. The schedule
   comparison looks *backwards*, over the week behind, and exists for the
   single passed slot the projection may state - `agenda.ts`'s own header
   says why that is a dose slot and can be nothing else. The third is
   today's own appointments, which name today's appointment row
   (functional-audit ticket 14, which folded the appointment-today tile
   into the agenda).

   No table list is exported to seed a live query with. All three reads are
   issued in the same `Promise.all`, before this function's first `await`,
   so a `liveQuery` discovers every dependency on its first run - the
   problem `WAITING_TABLES` exists for (five reads sitting past an earlier
   `await`) is not this one's. */

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
    panel names every regimen that produces dose-slot marks
    (functional-audit ticket 15), so drawn is the whole condition.

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
