/* Fetch the facts that rowForward.ts projects. Today, Transition and Care
   share the same reads. The dose owner supplies the next uncovered slot;
   raw calendar expectations cannot tell if an early dose covered it.

   Start all reads in one Promise.all before the first await so liveQuery
   discovers every dependency on its first run. The caller supplies
   todayEpochDay. rowForward.ts stays driver-free for Node tests. */

import { rowForward, type RowForwardFacts, type RowForwardMap, type RowForwardKey } from './rowForward';
import { SPINE_FORWARD_DAYS } from './careSpine';
import type { AppointmentsArea } from './journal/appointments';
import type { DosesArea } from './journal/doses';
import type { LettersArea } from './journal/letters';
import type { MilestonesArea } from './journal/milestones';
import type { ProceduresArea } from './journal/procedures';
import type { StockArea } from './journal/stock';
import type { TryoutsArea } from './journal/tryouts';
import type { WearSessionsArea } from './journal/wearSessions';

/** The areas a forward read may reach through: the ones `openJournal`
    already built, so every fact arrives through the same method its own
    screen would ask (the discipline `lastWrite.ts`, `offers.ts` and
    `agendaReads.ts` all keep). */
export interface RowForwardAreas {
  milestones: MilestonesArea;
  letters: LettersArea;
  wearSessions: WearSessionsArea;
  tryouts: TryoutsArea;
  appointments: AppointmentsArea;
  procedures: ProceduresArea;
  doses: DosesArea;
  stock: StockArea;
}

/** How far ahead the dose-slot read looks.

    `careSpine`'s own forward reach, borrowed rather than chosen again: the
    Care screen behind the row draws its rail over exactly this window, so a
    row that announced a dose the screen does not show would be the two
    surfaces disagreeing. A quarter is also past any dosing rhythm the app
    supports - a schedule with no slot in a hundred and twenty days is one
    the person has paused or ended. */
const DOSE_SLOT_REACH_DAYS = SPINE_FORWARD_DAYS;

/** How many letter seals to read.

    The same page size the letters tile takes. A page rather than a count
    because the row needs both the soonest unlock day and whether more than
    one is still sealed, and a hundred sealed letters is already far past what
    anybody writes - somebody past this page has a row that says "next one
    opens in ..." either way, which is the only thing the number changes. */
const LETTER_SEAL_PAGE = 100;

/** What every row has to say facing forwards, today.

    When rows are supplied, fetch only their facts.

    `null` is not one of the answers: a journal with nothing ahead in it
    comes back as an empty map, which is what `rowLine` falls through on. */
export async function readRowForward(
  areas: RowForwardAreas,
  todayEpochDay: number,
  rows?: readonly RowForwardKey[]
): Promise<RowForwardMap> {
  const includes = (row: RowForwardKey) => rows === undefined || rows.includes(row);
  const [milestones, seals, runningWear, tryouts, appointments, procedures, nextDose, stock] =
    await Promise.all([
      includes('milestones') ? areas.milestones.getMilestones() : [],
      includes('letters') ? areas.letters.getLetterSeals(LETTER_SEAL_PAGE) : [],
      includes('wear') ? areas.wearSessions.getRunningSession() : null,
      includes('tryouts') ? areas.tryouts.getTryouts() : [],
      includes('appointments') ? areas.appointments.getAppointments() : [],
      includes('surgery') ? areas.procedures.getProcedures() : [],
      includes('care') ? areas.doses.getNextUncoveredSlot(todayEpochDay, todayEpochDay + DOSE_SLOT_REACH_DAYS) : null,
      includes('care') ? areas.stock.getProjections(todayEpochDay) : []
    ]);

  /* The soonest run-out across every tracked drug, which is the one the row
     can state in a line. A drug with no rate to project from has no run-out
     day at all (`stockProjection.ts` returns null), and a row saying nothing
     about it is the honest answer rather than a guess at one. */
  const runOutDays = stock
    .map((row) => row.projection.runOutEpochDay)
    .filter((day): day is number => day !== null && day >= todayEpochDay);

  const facts: RowForwardFacts = {
    todayEpochDay,
    milestones,
    letterUnlockDays: seals.map((seal) => seal.unlockEpochDay),
    runningWear,
    tryouts,
    appointments,
    procedures,
    nextDoseEpochDay: nextDose?.epochDay ?? null,
    runOutEpochDay: runOutDays.length === 0 ? null : Math.min(...runOutDays)
  };

  return rowForward(facts);
}
