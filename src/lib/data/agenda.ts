/* The agenda: one projection of what is coming (phase 10 redesign ticket 04,
   ADR-0073, CONTEXT: "Agenda").

   Everything the app draws looks backwards. The half of a transition that
   arrives with dates on it - an appointment, a surgery day, a milestone
   still ahead, a letter opening, an injection on a day that is not every
   day - is exactly what `dayAhead` already computes (ADR-0067), and this is
   the projection Today draws over it. No second forward read is introduced
   here and no sixth kind of mark: the five are the ADR's five, and its six
   opt-outs stay opted out, run-out day included.

   Split from `agendaReads.ts` beside it for the reason `comingBack.ts` is
   split from `comingBackReads.ts` and `liveTiles.ts` from its own
   `.svelte.ts`: the window, the ordering, the fold, the absence rule and
   the passed slot are the decisions, they want a Node test with no driver,
   so they take rows. Nothing here reads a clock: `todayEpochDay` arrives as
   an argument, the same as every pure module at this seam.

   One sentence does live here, `passedSlotSentence` at the foot of the
   file, and paraglide is imported for it - `liveTiles.ts` next door carries
   its tiles' words for the same reason. The marks' own words are
   `dayAheadRows.ts`'s, because a mark is already drawn there; a slot that
   passed is not a mark and reaches no other module.

   Three rules are worth reading before changing anything:

   *Absent, never empty.* A window with nothing in it returns `null` rather
   than an empty projection, so a caller has no empty state to draw. Day one
   of a new journal is the common case, and "Nothing coming up" on the first
   screen is the app talking about itself.

   *A passed slot is a fact, never a tally.* One item, the most recent slot
   that went by with nothing logged against it, carrying its own date and
   nothing else - never a count, never a streak, never a run of them.
   ADR-0062's rule for `/coming-back` governs the words as well: what is
   waiting gets named, what did not happen does not.

   *Only a schedule the person set themselves, and never a daily one.* The
   passed item is a dose slot and can be nothing else. A schedule is the one
   dated thing in the app the person authored, so stating that its day went
   by states their own arrangement back to them; an appointment's date
   belongs to a clinic, and an app telling somebody they missed one would be
   inventing a duty out of somebody else's calendar. A daily schedule is
   excluded for ADR-0067's own reason, restated backwards: a daily slot
   marks every day a screen can draw, so a daily one that passed would put a
   row on this screen most mornings, which is wallpaper if it is lucky and a
   scolding if it is not. */

/* Relative rather than `$lib`, the same as `liveTiles.ts` beside it: this
   file is read by the Node tier, where no alias exists. And the same reason
   its four display formats arrive as callbacks - a date's own words reach
   paraglide through `$lib`, so `passedSlotSentence` below is handed the
   formatter rather than reaching for one. */
import { m } from '../paraglide/messages';
import { isDailySchedule, mostRecentPassedSlot } from './doseSchedule';
import type { DayAheadMark, DayAheadMarkKind } from './journal/dayAhead';
import { DAY_AHEAD_ROUTES } from './journal/dayAheadRoutes';
import type { DoseScheduleComparison } from './journal/doses';

/** How many days the agenda covers, today counted as one of them, and how
    many the week behind holds for the passed slot. Seven is the week a
    person can hold in their head.

    Not read off `weekStripDayCount`, which is a responsive count of cells a
    strip has room for rather than a stretch of time, and which leaves Home
    in this phase's ticket 13 anyway. */
export const AGENDA_DAYS = 7;

/** The first `AGENDA_CAP` at their own weight, the rest folded. Three
    because a first screen that opens on four dated rows is a list rather
    than a glance, which is also how the tile grid arrived at its own three
    (`HOME_TILE_CAP`, ADR-0039). Its own constant and not that one: the two
    bands answer to the same reasoning, not to one number, and either could
    be argued to a different figure without dragging the other with it. */
export const AGENDA_CAP = 3;

/** One dated thing, and where to go to read more about it. Carries the day
    and the kind, which is the whole of what a mark says (dayAhead.ts) -
    never which appointment, never which letter. */
export interface AgendaItem {
  /** The row's own walkthrough handle (ADR-0029) - stable, never the copy.
      Keyed by kind *and* day, since a weekly injection earns one mark per
      slot inside a seven-day window. */
  key: string;
  kind: DayAheadMarkKind;
  epochDay: number;
  route: string;
}

/** The one slot that went by with nothing logged against it. Its own shape
    rather than an `AgendaItem` with a flag, because it is not a dated thing
    coming up and must never be ordered among them. */
export interface AgendaPassedSlot {
  key: string;
  epochDay: number;
  route: string;
}

/** What the agenda holds. Both halves of the fold come back, because the
    fold is a disclosure and not a suppression - the row has to be able to
    draw what it is holding (`splitHomeTiles`'s own reasoning). */
export interface Agenda {
  shown: AgendaItem[];
  folded: AgendaItem[];
  passed: AgendaPassedSlot | null;
}

export interface AgendaInput {
  todayEpochDay: number;
  /** `dayAhead.getDayAhead` over `agendaWindow`, already floored at today
      by the read itself. */
  marks: readonly DayAheadMark[];
  /** `doses.getComparison` over the week behind. Its union already carries
      the reasons there is nothing to compare against, so this file asks
      about slots only in the one arm where a schedule exists - the same
      narrowing `whatIsWaiting` does. */
  doses: DoseScheduleComparison;
  /** Disguise, read from preferences by the caller. True returns nothing at
      all: no drug name, no clinic and no date reaches a screen somebody may
      be reading over the person's shoulder.

      `readAgenda` checks the same flag and returns before either read runs,
      so on the one production path this field is never true. Both checks
      stay: that one is what keeps the reads from happening, and this one is
      what makes the rule true of the projection itself, which is where a
      future caller assembling its own input would meet it. */
  disguised: boolean;
}

/** The window Today asks `dayAhead` for: `AGENDA_DAYS` days starting today,
    both ends inclusive, so a week opened on a Monday ends on the Sunday.
    Today itself is in it - today's own appointment is as much a thing
    arriving as Thursday's. */
export function agendaWindow(todayEpochDay: number): { fromEpochDay: number; toEpochDay: number } {
  return { fromEpochDay: todayEpochDay, toEpochDay: todayEpochDay + AGENDA_DAYS - 1 };
}

/** The window the passed slot is looked for in: the same many days, ending
    yesterday. Today's slot has not passed - the person has all day - and
    Home's own dose panel is what asks about it. */
export function agendaPassedWindow(todayEpochDay: number): { fromEpochDay: number; toEpochDay: number } {
  return { fromEpochDay: todayEpochDay - AGENDA_DAYS, toEpochDay: todayEpochDay - 1 };
}

/** The most recent slot that went by with nothing logged against it, or
    null. `rows` is already the schedule's own answer with pauses removed
    (doseSchedule.ts): a break somebody declared is not a slot that passed.

    Every arm with a `reason` answers null, `multipleEpisodes` included, so
    two concurrent regimens produce no passed slot at all - `/coming-back`
    narrows the same way. It errs the safe direction: the failure mode of
    guessing which episode a slot belonged to is stating one drug's
    arrangement under another drug's name.

    The daily check is this surface's own and is why the row selection is
    shared with `/coming-back` but this function is not. ADR-0067 keeps a
    daily slot off a forward mark; a daily slot that passed has to be kept
    off an everyday screen for the same reason, and the return surface -
    met once, after three weeks away - is a different question. */
function passedSlot(doses: DoseScheduleComparison, todayEpochDay: number): AgendaPassedSlot | null {
  if (doses.reason !== null || isDailySchedule(doses.schedule)) return null;
  const passed = mostRecentPassedSlot(doses.comparison, todayEpochDay);
  if (!passed) return null;
  return {
    key: `agenda-passed-${passed.slot.epochDay}`,
    epochDay: passed.slot.epochDay,
    route: DAY_AHEAD_ROUTES.doseSlot
  };
}

/** How the passed slot reads: the schedule's own arrangement and the day it
    fell on, and nothing else. No verb about the person, no count, no run,
    no word for what did not happen - ADR-0062's rule for `/coming-back`,
    which states what is waiting and never what is missing.

    It is deliberately the same sentence `/coming-back` says
    (`coming_back_dose_row`) under its own key rather than that one: the two
    surfaces state the same fact under the same rule, and a separate key is
    what lets either be reworded without silently rewording the other.

    Lives here, beside the rule that decides the item, rather than in
    `dayAheadRows.ts`: a slot that passed is not a `dayAhead` mark and never
    reaches that module. Drawn by this phase's ticket 13; until then its own
    test is the only caller. */
export function passedSlotSentence(epochDay: number, fullDay: (epochDay: number) => string): string {
  return m.agenda_passed_dose({ date: fullDay(epochDay) });
}

/** What is coming, or null where nothing is.

    The sort is by day alone, and `Array.prototype.sort` is stable, so two
    marks sharing a day keep the order the read returned them in - which is
    registry order (`assembleDayAhead`), the same order `/day/[day]` draws
    them in. */
export function agenda(input: AgendaInput): Agenda | null {
  if (input.disguised) return null;

  const items: AgendaItem[] = [...input.marks]
    .sort((a, b) => a.epochDay - b.epochDay)
    .map((mark) => ({
      key: `agenda-${mark.kind}-${mark.epochDay}`,
      kind: mark.kind,
      epochDay: mark.epochDay,
      route: DAY_AHEAD_ROUTES[mark.kind]
    }));

  const passed = passedSlot(input.doses, input.todayEpochDay);
  if (items.length === 0 && !passed) return null;

  const folds = items.length > AGENDA_CAP;
  return {
    shown: folds ? items.slice(0, AGENDA_CAP) : items,
    folded: folds ? items.slice(AGENDA_CAP) : [],
    passed
  };
}
