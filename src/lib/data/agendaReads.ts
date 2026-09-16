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

import { agenda, agendaPassedWindow, agendaWindow, type Agenda } from './agenda';
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

/** What is coming in the week ahead, or null where nothing is - including
    every time disguise is on.

    `todayEpochDay` is an argument, as it is everywhere in this feature:
    nothing reads a clock, so a caller passes the same day it drew the rest
    of its screen with.

    `kinds` is the person's switch list (`shownAgendaKinds`, ticket 05),
    applied to the marks before they reach the projection rather than to its
    output: a kind switched off is not a fold's business, so the cap counts
    only the kinds that are on. Defaulted to every kind for the caller that
    has no switches to hand. The switches sit above the projection, as
    ADR-0074 puts it, and this is the one place they touch it.

    `dosePanelCoversEveryDose` is the second thing that can take a kind off
    the band, and it is not a switch: Today draws a dose panel for as long
    as a regimen is running, and since phase 11 ticket 03 that panel states
    the next slot's own day. A `doseSlot` row beside it is the same
    medication twice - the whole-app audit found the drug stated four ways
    on one screen - so the kind is withheld while the panel says it.
    Withheld here rather than dropped from `kinds` at the call site, so the
    rule is written where the band is assembled and can be tested without a
    screen.

    What the caller has to have established is that the panel accounts for
    the *whole* kind, not merely that one is drawn. The panel names one drug
    and `dayAhead`'s `doseSlot` section reads every active episode, so on
    two concurrent regimens the panel stands for one of them and the rows
    for both; `dosePanelCoversEveryRegimen` (liveTiles.ts) is the answer to
    that question and the flag Today passes. A drug the panel does not stand
    for keeps its rows, which is what stops the day a schedule expects from
    being on the screen nowhere at all. ADR-0067 is untouched either way:
    the kind is still read, and the calendar and the day view still draw
    it. */
export async function readAgenda(
  areas: AgendaAreas,
  todayEpochDay: number,
  disguised: boolean,
  kinds: readonly DayAheadMarkKind[] = DAY_AHEAD_MARK_KINDS,
  dosePanelCoversEveryDose = false
): Promise<Agenda | null> {
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

  const on = new Set<DayAheadMarkKind>(kinds);
  if (dosePanelCoversEveryDose) on.delete('doseSlot');
  return agenda({ todayEpochDay, marks: marks.filter((mark) => on.has(mark.kind)), doses, disguised });
}
