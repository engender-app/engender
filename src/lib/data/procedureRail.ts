/* Where a procedure's own phases fall against each other in time (phase 10
   redesign ticket 52, DIRECTION.md rule 16). Pure, and kept above the
   journal seam beside recoveryDay.ts and careSpine.ts for the same reason
   those two are: nothing here is stored, which day is "today" is a local
   calendar question the data layer has no business answering, and the
   arithmetic of putting several days on one line wants one home with tests
   while the wording stays with the screen.

   This is careSpine.ts's shape, anchored differently. The care rail is read
   out from today in both directions, so today sits in its middle. A
   procedure is read out from its surgery date - the consults happened
   before it, the healing happens after it, and "day N" counts from it - so
   the date is what sits in the middle here and today is a mark like any
   other. That is the whole of the difference, and it is why this is its own
   module rather than an option on that one.

   Nothing here judges, and one omission is deliberate rather than
   incidental: the rail draws no healing horizon, no expected duration and
   no share of anything completed. The stretch it draws between the date and
   today is the distance already travelled, which is what "day N of healing"
   already says in words. A band running from the date to a 90-day cutoff
   with today's tick somewhere along it would be a progress bar through a
   recovery, which ticket 52 rules out in as many words and which
   recoveryDay.ts has refused since it was written - "no expected duration,
   no phase, nothing about being ahead of or behind anything".
   SURGERY_RECOVERY_CUTOFF_DAYS keeps deciding which phase a procedure is in
   and decides nothing about this drawing.

   Ticket 52 cites ADR-0012 for the day-N rule and that citation does not
   check out: ADR-0012 is native units, normalized values for colour and no
   worst-to-best legend. It is the neighbouring principle - no end of a
   scale is the good end - rather than this one, and the rule this module
   actually keeps is recoveryDay.ts's own. */

/** How far back of the surgery date the rail will reach for a consult.

    Bounded for careSpine's reason: one far-off mark spends the whole line
    on itself. A first consult four years before the operation, with two
    more in the last month, would leave those two inside the last two
    percent of the left half. A year is already a long referral, and a
    consult older than that is drawn at the end it was clamped to and
    flagged, so the rail says "further back than this shows" rather than
    pretending it was recent. */
export const RAIL_BACK_REACH_DAYS = 365;

/** The least the rail spans either side of the date, whatever the marks
    say. Without a floor a procedure consulted the day before surgery draws
    its consult hard against the left edge, and one still a week away puts
    today there instead - two marks at the ends of a line, which says
    nothing about the gap between them. */
export const RAIL_MIN_BACK_DAYS = 14;
export const RAIL_MIN_FORWARD_DAYS = 14;

export type ProcedureMarkKind = 'consult' | 'surgery' | 'today';

export interface ProcedureMark {
  kind: ProcedureMarkKind;
  /** The consult's own id, so an `{#each}` can key on it and a consult
      being added or removed moves the marks either side of it rather than
      redrawing the rail. Absent on the surgery date and on today, which
      are one apiece. */
  id?: string;
  /** The day this mark stands for, never clamped. */
  epochDay: number;
  /** Where it is drawn, 0 at the rail's left end and 1 at its right. */
  position: number;
  /** True where `epochDay` fell outside the rail's reach, so the mark is
      drawn at the end it was pulled in to and the screen can say so. Only
      a consult can be beyond: the date is the anchor and today is always
      inside by construction. */
  beyondSpan: boolean;
}

export interface ProcedureRail {
  fromEpochDay: number;
  toEpochDay: number;
  /** Where the surgery date sits, or null while the procedure has none.
      With no date there is no pivot and nothing ahead of one: the rail is
      the consults behind today, and today in the middle of it. */
  pivot: number | null;
  /** The stretch between the date and today, from the earlier of the two
      to the later, or null while there is no date. Past the date it is the
      healing already travelled; before it, the wait. One drawing for both,
      because the card's own number already says which it is. */
  gap: { from: number; to: number } | null;
  /** Left to right. */
  marks: ProcedureMark[];
}

/** What the rail is drawn from: the procedure's date and its consults. The
    shape `Procedure` already has, narrowed to the two fields, so the screen
    passes a procedure straight in and a test needs no fixture. */
export interface ProcedureRailFacts {
  surgeryEpochDay: number | null;
  consults: readonly { id: string; epochDay: number }[];
}

/** A day as a signed distance from the anchor under a square root.

    Square root of the distance rather than the distance itself, careSpine's
    scale and for careSpine's reason: a procedure consulted twice in the
    fortnight before the operation and now four days out from it is the
    ordinary arrangement, and under a linear scale against a first consult a
    year back those three marks share four percent of the line. Under a root
    scale the near days get the room and the far ones compress towards the
    ends, which is the shape of the question.

    Signed and monotonic across zero, so the two sides are one scale rather
    than two halves stretched to fit. That matters here in a way it does not
    on the care rail: the date is what this line is about, so where it falls
    along the line has to be a fact about the journey. Half of a rail either
    side would pin the date to the middle and today to whichever end, and
    every procedure past its date would then draw the same right half. */
const scaled = (epochDay: number, anchor: number): number =>
  Math.sign(epochDay - anchor) * Math.sqrt(Math.abs(epochDay - anchor));

/** Where a day sits along the rail, 0 at its left end and 1 at its right.

    A length along this rail is not a number of days, so nothing here may be
    read off as a measurement. That is why the card writes its own dates and
    its own day count beside the rail, and why the rail carries no axis, no
    ticks between the marks and no scale: it says order and rough nearness,
    and the days are written down beside it. */
function positionOf(epochDay: number, anchor: number, fromEpochDay: number, toEpochDay: number): number {
  const day = Math.min(Math.max(epochDay, fromEpochDay), toEpochDay);
  const left = scaled(fromEpochDay, anchor);
  const span = scaled(toEpochDay, anchor) - left;
  return span === 0 ? 0 : (scaled(day, anchor) - left) / span;
}

/** The rail. Always one: unlike the care rail, which can have nothing but
    today on it and says so instead, a procedure always has at least the
    fact of where today falls against its own date, and that is the reading
    the screen exists to open with. A procedure with no date and no consults
    draws an empty line with today on it, which is true and is what the
    planning phase looks like. */
export function procedureRail(facts: ProcedureRailFacts, todayEpochDay: number): ProcedureRail {
  const anchor = facts.surgeryEpochDay ?? todayEpochDay;

  const earliestConsult = facts.consults.length
    ? Math.min(...facts.consults.map((consult) => consult.epochDay))
    : null;
  /* The left end reaches for the earliest consult, never further than the
     reach and never nearer than the floor, and then opens further still if
     today is behind that - today is on this rail by construction, so a
     surgery booked two years out is not a mark hanging off the end. */
  const reachedBack = Math.min(
    Math.max(earliestConsult ?? anchor, anchor - RAIL_BACK_REACH_DAYS),
    anchor - RAIL_MIN_BACK_DAYS
  );
  const fromEpochDay = Math.min(reachedBack, todayEpochDay);
  const toEpochDay = Math.max(anchor + RAIL_MIN_FORWARD_DAYS, todayEpochDay);

  const place = (epochDay: number): Pick<ProcedureMark, 'position' | 'beyondSpan'> => ({
    position: positionOf(epochDay, anchor, fromEpochDay, toEpochDay),
    beyondSpan: epochDay < fromEpochDay || epochDay > toEpochDay
  });

  const marks: ProcedureMark[] = facts.consults.map((consult) => ({
    kind: 'consult' as const,
    id: consult.id,
    epochDay: consult.epochDay,
    ...place(consult.epochDay)
  }));
  if (facts.surgeryEpochDay !== null) {
    marks.push({ kind: 'surgery', epochDay: facts.surgeryEpochDay, ...place(facts.surgeryEpochDay) });
  }
  marks.push({ kind: 'today', epochDay: todayEpochDay, ...place(todayEpochDay) });

  /* Ties resolve in reading order rather than by whichever fact was pushed
     first, the same rule careSpine's KIND_ORDER keeps: a consult on the day
     of the operation is drawn going in and today falling on it coming out,
     so the line reads consults, date, healing however the days collide. */
  const KIND_ORDER: ProcedureMarkKind[] = ['consult', 'surgery', 'today'];
  marks.sort((a, b) =>
    a.epochDay === b.epochDay
      ? KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
      : a.epochDay - b.epochDay
  );

  const todayPosition = positionOf(todayEpochDay, anchor, fromEpochDay, toEpochDay);
  const pivot =
    facts.surgeryEpochDay === null ? null : positionOf(facts.surgeryEpochDay, anchor, fromEpochDay, toEpochDay);
  const gap =
    pivot === null
      ? null
      : { from: Math.min(pivot, todayPosition), to: Math.max(pivot, todayPosition) };

  return { fromEpochDay, toEpochDay, pivot, gap, marks };
}
