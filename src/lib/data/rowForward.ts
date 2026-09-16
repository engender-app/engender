/* What a row says instead of reporting a gap (phase 11 all-four-doors ticket
   02, DIRECTION.md rule 16, ADR-0067, ADR-0073, ADR-0012).

   Nine of the seventeen rows on the Transition door carried a date-derived
   second line and all nine looked backwards. The milestones row said
   "Nothing logged for 1 year 4 months" over a screen showing a name-change
   hearing in sixteen days, because a milestone still ahead is not a last
   write and `lastWrite.ts` only answers the backwards question. Rule 16
   puts what is running and what is next before what changed, so this module
   is the forwards half: one fact per row, or none where there is nothing
   ahead to say.

   Pure, above the journal seam, beside `agenda.ts` and `comingBack.ts` and
   split from its reads the same way (`rowForwardReads.ts` fetches, this
   projects). No clock, no driver, no paraglide, no runes: today arrives as
   an argument and the words are `vocabulary/hubLabels.ts`'s.

   **Nothing here is a new kind of fact.** Every row below is read off
   something a screen already draws - the milestone mirror, the letters'
   seals, the running wear session, the running tryout, the appointment
   list, the procedure list, the agenda's own dose slot (ADR-0067) and the
   stock projection. What is new is only that a *row* may now say it.

   Names are read off the records rather than off `dayAhead`'s marks, and
   that is deliberate: ADR-0067 is explicit that a mark carries a day and a
   kind and nothing else - "never which appointment, never which letter" -
   and the copy here has to name the thing ("Name-change hearing in 16
   days"). The one fact this takes from `dayAhead` is the next dose slot,
   which needs no name and does need the schedule arithmetic that registry
   already owns.

   **Nothing here ranks.** A row states the one fact nearest its own reason
   for existing; no row is urgent, late or due, and nothing is coloured by
   how far off it is (ADR-0012). The rows keep their registry order
   (ADR-0073) - this module never reorders anything. */

import { recoveryDay } from './recoveryDay';
import type { Appointment, Measurement, Milestone, Procedure, Tryout, WearKind } from './types';

/** The rows that can carry a forward fact.

    A subset of `HubRowKey`, declared here rather than imported so that
    `hubRows.ts` can consult this module without the two importing each
    other; `hubRows.ts` asserts the subset relation at the type level, so a
    key renamed there is a compile error here rather than a row that
    silently stops speaking.

    Eight rows, and the eight are not an arbitrary cut: they are every row
    whose area holds either a dated future or a span that is running now,
    plus `measurements`, which holds neither and states its last value
    instead (see `RowValue`). */
export const ROW_FORWARD_KEYS = [
  'measurements',
  'care',
  'surgery',
  'appointments',
  'milestones',
  'tryouts',
  'wear',
  'letters'
] as const;

export type RowForwardKey = (typeof ROW_FORWARD_KEYS)[number];

/** A span that is running now.

    `wear` and `tryouts` carry one; `surgery` carries the day count since an
    operation, which is a span in the same sense - it began on a day and has
    not ended. None of the three has an end to count down to, so none of
    them is a `next`. */
export type RunningWhat =
  /** A wear session with no duration yet: a timer somebody started
      (`wearSessions.getRunningSession`). The line counts up from
      `startTimestamp` the way the wear tile's does, which is why the
      timestamp travels rather than a duration worked out here - this module
      has no clock. */
  | { area: 'wear'; wearKind: WearKind; startTimestamp: number }
  /** A tryout with no end day. `dayCount` counts the first day as day one,
      `tryoutReading.ts`'s own rule. */
  | { area: 'tryout'; label: string; dayCount: number }
  /** Days since an operation. Unbounded rather than cut off at
      `SURGERY_RECOVERY_CUTOFF_DAYS`: the tile on Home drops away after
      ninety days because it is news, and a row saying what is behind it is
      not news. */
  | { area: 'postOp'; days: number };

/** Something dated ahead of today. */
export type NextWhat =
  /** The milestone's own name, which is the whole reason this is read off
      the record rather than off a mark. */
  | { area: 'milestone'; name: string }
  /** A sealed letter's unlock day. `several` is whether more than one is
      still sealed, which is the only thing that changes the wording - never
      which letter, and never a word of its text (`letters.ts`). */
  | { area: 'letter'; several: boolean }
  /** An appointment's kind as the person typed it, or null where they left
      it blank. */
  | { area: 'appointment'; appointmentKind: string | null }
  /** A consult on the way to a procedure, or the operation itself. */
  | { area: 'consult' }
  | { area: 'surgery' }
  /** The next expected dose slot, with the run-out day where stock has one.
      The run-out travels alongside rather than as a fact of its own because
      the Care row says both in one line ("Next dose 21 September, runs out 5
      October") - and it is a date and never a countdown, which is the
      standing refusal stock copy already keeps. */
  | { area: 'dose'; runOutEpochDay: number | null }
  /** Stock running out, where there is no dose slot to put it beside. */
  | { area: 'runOut' };

/** The one row with neither a span nor a date: it states its last value
    rather than the age of it, since a value is more of a reading than a
    gap. Still carries the day, because the line says both ("Waist 77 cm, 8
    days ago"). */
export interface RowValue {
  kind: 'value';
  epochDay: number;
  /** The measurement type's key. The name is looked up at display time
      (`vocabulary.measurementTypeName`), the split every built-in
      vocabulary keeps. */
  type: string;
  value: number;
  unit: string;
}

/** What one row says, where it has something forward to say. */
export type RowForward =
  | { kind: 'running'; what: RunningWhat }
  | { kind: 'next'; epochDay: number; what: NextWhat }
  | RowValue;

/** Everything the projection needs, each piece from the read its own screen
    already makes (`rowForwardReads.ts`).

    Spelled out as rows rather than as an area object so the whole of this
    file is testable on the Node tier with no driver - the discipline
    `agenda.ts` and `comingBack.ts` keep next door. */
export interface RowForwardFacts {
  todayEpochDay: number;
  /** Narrowed to what a line may say, the discipline `milestoneStatus.ts`
      already keeps with `Pick<Milestone, 'epochDay'>`: a row names a
      milestone and dates it, and has no business holding its photo. */
  milestones: readonly Pick<Milestone, 'name' | 'epochDay'>[];
  /** Every letter's unlock day, in any order. Days, not letters: what the
      row may say is that one opens and when, so the ids and the text never
      travel this far. A letter already open falls out on the day rather
      than on a flag - its unlock day has passed, which is the same fact. */
  letterUnlockDays: readonly number[];
  runningWear: { kind: WearKind; startTimestamp: number } | null;
  tryouts: readonly Pick<Tryout, 'label' | 'startEpochDay' | 'endEpochDay'>[];
  appointments: readonly Pick<Appointment, 'epochDay' | 'kind' | 'procedureId'>[];
  procedures: readonly Pick<Procedure, 'surgeryEpochDay' | 'consults'>[];
  /** The soonest dose slot still ahead, out of the agenda's own forward
      read (ADR-0067), or null where no schedule expects one. */
  nextDoseEpochDay: number | null;
  /** The soonest run-out day across every tracked stock, or null where
      nothing projects one (`stockProjection.ts` returns null for a stock
      with no rate to project from). */
  runOutEpochDay: number | null;
  /** The most recent measurement of any type, at or before today. */
  latestMeasurement: Pick<Measurement, 'epochDay' | 'type' | 'value' | 'unit'> | null;
}

/** The soonest day at or after today in a list, or null. */
function soonest(days: readonly number[], todayEpochDay: number): number | null {
  const ahead = days.filter((day) => day >= todayEpochDay);
  return ahead.length === 0 ? null : Math.min(...ahead);
}

/** The milestone dated soonest at or after today, if any.

    A milestone in the past has an anniversary (`milestoneStatus.ts`) and
    this deliberately ignores it: an anniversary is a reading of a day that
    already happened, and a row that announced one would be saying a date
    the person did not enter. */
function nextMilestone(facts: RowForwardFacts): RowForward | null {
  const ahead = facts.milestones
    .filter((milestone) => milestone.epochDay >= facts.todayEpochDay)
    .sort((a, b) => a.epochDay - b.epochDay);
  const first = ahead[0];
  return first ? { kind: 'next', epochDay: first.epochDay, what: { area: 'milestone', name: first.name } } : null;
}

function nextLetter(facts: RowForwardFacts): RowForward | null {
  const day = soonest(facts.letterUnlockDays, facts.todayEpochDay);
  if (day === null) return null;
  const stillSealed = facts.letterUnlockDays.filter((each) => each >= facts.todayEpochDay).length;
  return { kind: 'next', epochDay: day, what: { area: 'letter', several: stillSealed > 1 } };
}

function nextAppointment(facts: RowForwardFacts): RowForward | null {
  const ahead = facts.appointments
    .filter((appointment) => appointment.epochDay >= facts.todayEpochDay)
    /* A consult belongs to the surgery row, which states it there
       (ADR-0066: one appointment record, two screens reading it). Saying it
       on both rows would be the app repeating itself, which is the whole
       complaint phase 11 is answering. */
    .filter((appointment) => appointment.procedureId === null)
    .sort((a, b) => a.epochDay - b.epochDay);
  const first = ahead[0];
  return first
    ? { kind: 'next', epochDay: first.epochDay, what: { area: 'appointment', appointmentKind: first.kind } }
    : null;
}

/** What the surgery row says: the post-op day where an operation has
    happened, otherwise the soonest dated thing on the way to one.

    The running span wins over the dated future, which is rule 16's own
    order and the choice rule this ticket states: what is running comes
    before what is next. So somebody four hundred days past an operation
    reads "Post-Op Day 400" rather than a consult nine days out - the consult
    is on the screen behind the row, and the row says where the journey
    stands.

    Unbounded by `SURGERY_RECOVERY_CUTOFF_DAYS` on purpose; `RunningWhat`
    says why. Where more than one procedure has happened, the most recent
    operation is the one the count is from. */
function surgeryFact(facts: RowForwardFacts): RowForward | null {
  const operated = facts.procedures
    .map((procedure) => procedure.surgeryEpochDay)
    .filter((day): day is number => day !== null && day <= facts.todayEpochDay);

  if (operated.length > 0) {
    const status = recoveryDay(Math.max(...operated), facts.todayEpochDay);
    /* `surgeryDay` is its own case in `recoveryDay` and reads as day zero
       here: an operation today is not a gap of any length, and the line the
       screen shows for it is the same "Post-Op Day 0" its own header uses. */
    const days = status.type === 'since' ? status.days : 0;
    return { kind: 'running', what: { area: 'postOp', days } };
  }

  const surgeryAhead = facts.procedures
    .map((procedure) => procedure.surgeryEpochDay)
    .filter((day): day is number => day !== null && day > facts.todayEpochDay);
  const consultAhead = facts.procedures.flatMap((procedure) =>
    procedure.consults.map((consult) => consult.epochDay).filter((day) => day >= facts.todayEpochDay)
  );

  const nextSurgery = soonest(surgeryAhead, facts.todayEpochDay);
  const nextConsult = soonest(consultAhead, facts.todayEpochDay);

  /* The nearer of the two, and the consult wins a tie: a consult and an
     operation dated the same day is somebody being seen on the morning of
     it, which is the earlier of the two events. */
  if (nextConsult !== null && (nextSurgery === null || nextConsult <= nextSurgery)) {
    return { kind: 'next', epochDay: nextConsult, what: { area: 'consult' } };
  }
  return nextSurgery === null ? null : { kind: 'next', epochDay: nextSurgery, what: { area: 'surgery' } };
}

/** What the tryouts row says: the tryout that is running, by the one that
    has been running longest.

    Several can be open at once (`tryouts.ts`), and the oldest is the one
    with something to report - a tryout started this morning says "day 1",
    which is a fact the person has just written down themselves. */
function runningTryout(facts: RowForwardFacts): RowForward | null {
  const running = facts.tryouts
    .filter((tryout) => tryout.endEpochDay === null && tryout.startEpochDay <= facts.todayEpochDay)
    .sort((a, b) => a.startEpochDay - b.startEpochDay);
  const first = running[0];
  if (!first) return null;
  return {
    kind: 'running',
    what: { area: 'tryout', label: first.label, dayCount: facts.todayEpochDay - first.startEpochDay + 1 }
  };
}

/** What the Care row says: the next dose slot with the run-out beside it,
    or the run-out alone where no schedule expects a dose.

    Both are dates and neither is a countdown - the standing refusal on
    stock, which this row inherits rather than restates (`stockLabel.ts`). */
function careFact(facts: RowForwardFacts): RowForward | null {
  if (facts.nextDoseEpochDay !== null) {
    return {
      kind: 'next',
      epochDay: facts.nextDoseEpochDay,
      what: { area: 'dose', runOutEpochDay: facts.runOutEpochDay }
    };
  }
  return facts.runOutEpochDay === null
    ? null
    : { kind: 'next', epochDay: facts.runOutEpochDay, what: { area: 'runOut' } };
}

function wearFact(facts: RowForwardFacts): RowForward | null {
  const session = facts.runningWear;
  return session
    ? { kind: 'running', what: { area: 'wear', wearKind: session.kind, startTimestamp: session.startTimestamp } }
    : null;
}

function measurementFact(facts: RowForwardFacts): RowForward | null {
  const latest = facts.latestMeasurement;
  return latest
    ? { kind: 'value', epochDay: latest.epochDay, type: latest.type, value: latest.value, unit: latest.unit }
    : null;
}

/** One fact per row, for the rows that have one.

    Declared as a total record over `RowForwardKey` so a key added to the
    list above without a rule is a typecheck failure rather than a row that
    quietly keeps reporting its gap. */
const FACTS: Record<RowForwardKey, (facts: RowForwardFacts) => RowForward | null> = {
  measurements: measurementFact,
  care: careFact,
  surgery: surgeryFact,
  appointments: nextAppointment,
  milestones: nextMilestone,
  tryouts: runningTryout,
  wear: wearFact,
  letters: nextLetter
};

export type RowForwardMap = Partial<Record<RowForwardKey, RowForward>>;

/** What every row that has a forward fact says today.

    A row with nothing ahead is absent from the map rather than present with
    a null, so `rowLine` falls through to the reading it always had. */
export function rowForward(facts: RowForwardFacts): RowForwardMap {
  const map: RowForwardMap = {};
  for (const key of ROW_FORWARD_KEYS) {
    const fact = FACTS[key](facts);
    if (fact) map[key] = fact;
  }
  return map;
}
