/* The reads behind the agenda (phase 10 redesign ticket 04, ADR-0074).

   Split from `agenda.ts` for the reason `comingBackReads.ts` is split from
   `comingBack.ts`: the projection is where the window, the cap and the
   passed-slot rule are, and it wants a Node test with no driver, so it
   takes rows. This file is what fetches them, in one place, so every
   surface that ever asks what is coming asks the same two questions.

   Two reads, and only one of them looks forward. `dayAhead.getDayAhead` is
   the app's one forward read (ADR-0067) and nothing here adds a second:
   Today is its seventh consumer, not a new mechanism. The schedule
   comparison looks *backwards*, over the week behind, and exists for the
   single passed slot the projection may state - `agenda.ts`'s own header
   says why that is a dose slot and can be nothing else.

   Disguise is checked before either read runs. A screen that is not going
   to draw an agenda should not be reading appointments and drug schedules
   to decide not to draw one.

   No table list is exported to seed a live query with. Both reads are
   issued in the same `Promise.all`, before this function's first `await`,
   so a `liveQuery` discovers both dependencies on its first run - the
   problem `WAITING_TABLES` exists for (five reads sitting past an earlier
   `await`) is not this one's. */

import { agenda, agendaPassedWindow, agendaWindow, type Agenda, type AgendaInput } from './agenda';
import { DAY_AHEAD_MARK_KINDS, type DayAheadArea, type DayAheadMarkKind } from './journal/dayAhead';
import type { DosesArea } from './journal/doses';

/** The areas the agenda reads: the ones `openJournal` already built, so
    every fact arrives through the same method its own screen would ask
    (the discipline `lastWrite.ts`, `offers.ts` and `comingBackReads.ts` all
    keep). */
export interface AgendaAreas {
  dayAhead: DayAheadArea;
  doses: DosesArea;
}

/** Read the agenda's facts without waiting for the live tiles to decide
    whether their dose panel covers every regimen. Disguise reads nothing. */
export async function readAgenda(
  areas: AgendaAreas,
  todayEpochDay: number,
  disguised: boolean
): Promise<AgendaInput | null> {
  if (disguised) return null;

  const ahead = agendaWindow(todayEpochDay);
  const behind = agendaPassedWindow(todayEpochDay);
  const [marks, doses] = await Promise.all([
    areas.dayAhead.getDayAhead(ahead.fromEpochDay, ahead.toEpochDay, todayEpochDay),
    /* `getComparison` is what resolves the episode in effect, its schedule
       and its pauses, so this file asks one question instead of assembling
       four - the same reason the return surface asks it. */
    areas.doses.getComparison(behind)
  ]);

  return { todayEpochDay, marks, doses, disguised };
}

/** Apply the current switches and dose-panel coverage to the same facts.
    Filter before capping, so a withheld dose never takes another row's room.
    Coverage includes every regimen producing dose-slot marks. A second
    such regimen preserves the marks; daily or unscheduled regimens do not. */
export function projectAgenda(
  facts: AgendaInput | null | undefined,
  kinds: readonly DayAheadMarkKind[] = DAY_AHEAD_MARK_KINDS,
  dosePanelCoversEveryDose = false
): Agenda | null {
  if (!facts) return null;
  const on = new Set<DayAheadMarkKind>(kinds);
  if (dosePanelCoversEveryDose) on.delete('doseSlot');
  return agenda({ ...facts, marks: facts.marks.filter((mark) => on.has(mark.kind)) });
}
