/* The reads behind a row's forward fact (phase 11 all-four-doors ticket 02).

   Split from `rowForward.ts` the way `agendaReads.ts` is split from
   `agenda.ts` and `comingBackReads.ts` from `comingBack.ts`: the projection
   is where the rules are and it wants a Node test with no driver, so it
   takes rows. This is what fetches them, in one place, so the two surfaces
   that draw rows ask the same nine questions rather than each assembling
   its own idea of what is coming.

   **Nine reads, none of them new as a question.** Every one is a method a
   screen already calls - the milestone list the milestones screen draws,
   the seals the letters tile reads, the running session the wear tile
   reads, the tryouts the tryout tile reads, the appointments Today already
   holds for its debrief offer, the procedures the surgery tile reads, the
   agenda's own forward read, the stock projections the Care screen draws,
   and one bounded row of measurements. The ticket's own line: no new data,
   no new read, no new screen.

   The dose slot comes through `dayAhead` rather than through the schedule
   arithmetic directly, which is the one place this file defers to another
   registry. ADR-0067 already owns "which day does a schedule next expect a
   dose", pauses and logged-ahead doses included, and a second answer to
   that question is exactly the drift `lastWrite.ts`'s own header refuses.
   Nothing else is taken from there, because a mark carries no name and
   eight of the nine lines have to say what the thing is.

   Every read is issued inside one `Promise.all`, before this function's
   first `await`, so a `liveQuery` wrapping it discovers all nine
   dependencies on its first run - the problem `WAITING_TABLES` exists for
   is not this one's (`agendaReads.ts` says the same about its two).

   Nothing here reads a clock: `todayEpochDay` arrives as an argument, the
   same as everywhere above the journal seam. */

import { rowForward, type RowForwardFacts, type RowForwardMap } from './rowForward';
import { SPINE_FORWARD_DAYS } from './careSpine';
import type { AppointmentsArea } from './journal/appointments';
import type { DayAheadArea } from './journal/dayAhead';
import type { LettersArea } from './journal/letters';
import type { MeasurementsArea } from './journal/measurements';
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
  dayAhead: DayAheadArea;
  stock: StockArea;
  measurements: MeasurementsArea;
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
    one is still sealed, and sixty sealed letters is already far past what
    anybody writes - somebody past this page has a row that says "next one
    opens in ..." either way, which is the only thing the number changes. */
const LETTER_SEAL_PAGE = 100;

/** What every row has to say facing forwards, today.

    `null` is not one of the answers: a journal with nothing ahead in it
    comes back as an empty map, which is what `rowLine` falls through on. */
export async function readRowForward(areas: RowForwardAreas, todayEpochDay: number): Promise<RowForwardMap> {
  const [milestones, seals, runningWear, tryouts, appointments, procedures, marks, stock, latestMeasurement] =
    await Promise.all([
      areas.milestones.getMilestones(),
      areas.letters.getLetterSeals(LETTER_SEAL_PAGE),
      areas.wearSessions.getRunningSession(),
      areas.tryouts.getTryouts(),
      areas.appointments.getAppointments(),
      areas.procedures.getProcedures(),
      areas.dayAhead.getDayAhead(todayEpochDay, todayEpochDay + DOSE_SLOT_REACH_DAYS, todayEpochDay),
      areas.stock.getProjections(todayEpochDay),
      areas.measurements.latestMeasurement(todayEpochDay)
    ]);

  /* Marks arrive in day order across every kind (dayAhead.ts sorts them), so
     the first dose slot in the list is the next one. */
  const nextDose = marks.find((mark) => mark.kind === 'doseSlot');

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
    runOutEpochDay: runOutDays.length === 0 ? null : Math.min(...runOutDays),
    latestMeasurement
  };

  return rowForward(facts);
}
