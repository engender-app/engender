/* Where the care readings fall against each other in time (phase 5
   deepening ticket 07, CONTEXT: "Dose event", "Lab draw context",
   "Run-out projection"). Pure, and kept above the journal seam beside
   stockProjection.ts and labTiming.ts for the same reason: this is a
   question about days, not a row anyone stores. Nothing here reads a clock
   or a database.

   This module lays readings out; it computes none of them. The last dose
   comes from the dose log, the next one from expectedSlots and adherence
   (doseSchedule.ts), the draw day from a LabResult, the run-out day from
   stockProjection.ts. Ticket 07 is explicit that the care screen may not
   hold a second implementation of any of those, so the only arithmetic in
   here is the arithmetic of putting five days on one line: which day sits
   where along the rail, which days had to be pulled in to the rail's reach,
   and which labels would have printed on top of each other.

   Nothing here judges. A mark is a day and a kind; no mark is late, none is
   due, and the rail names no interval as the right one. The wording lives
   in the screen's own catalogue strings, which say when a thing happened
   and stop (PRODUCT.md:109, and labTiming.ts's own header for the
   precedent). */

import { adherence, expectedSlots, type DoseSlot } from './doseSchedule';
import { epochDayFromTimestamp } from './epochDay';
import { resolveCurveDrug } from './hormoneDrug';
import { attributeDose, attributeDrug } from './regimenEpisode';
import type { DoseEvent, DosePause, DoseSchedule, RegimenEpisode } from './types';

/** How far the rail can reach either side of today.

    Bounded because the rail's whole job is relative distance, and one
    far-off mark spends the entire line on itself: a lab draw eight months
    back with everything else inside a fortnight leaves the doses stacked
    in the first two percent of the rail, which is a true picture nobody
    can read. A day past the reach is drawn at the end it was clamped to
    and flagged, so the rail says "further back than this shows" rather
    than pretending the draw was recent.

    Asymmetric because the two directions carry different questions.
    Backwards there is one mark, the draw, and quarterly bloodwork is
    normal, so sixty days is already generous for a rail measured in doses.
    Forwards there are two, and a run-out projection on a full box
    routinely lands months out; a hundred and twenty days is a whole
    quarter of runway, past which "a long way off" is the honest reading. */
/* SPINE_BACK_DAYS stays exported only for its own test (AU-09 test-only
   review). */
export const SPINE_BACK_DAYS = 60;
export const SPINE_FORWARD_DAYS = 120;

/** The least the rail spans either side of today, whatever the marks say.

    Without a floor a rail whose only other mark is tomorrow would span two
    days, and today's tick would sit hard against the left edge with the
    next dose against the right - two marks at the ends of a line, which
    says nothing about the gap between them. A fortnight each way gives
    every arrangement a middle to be near. */
/* SPINE_MIN_BACK_DAYS, SPINE_MIN_FORWARD_DAYS stay exported only for their own
   test (AU-09 test-only review). */
export const SPINE_MIN_BACK_DAYS = 14;
export const SPINE_MIN_FORWARD_DAYS = 14;

/** How close two labels may sit in the same label row, as a fraction of the
    rail.

    Sized against Polish rather than English, because Polish is what sets
    it: "Następna dawka" is the widest caption either catalogue holds. The
    number has been measured twice.

    0.30 was the one-lane rail's, sized against a 330px rail and a 91.2px
    label. Phase 11 ticket 10 measured the drawing again, on three lanes at
    390px with the full fixture (tests/care-lane-labels.mjs): the rail is
    292px, not 330 - the card's own padding and the track's margin take the
    rest - and at 292px the widest Polish captions are "Następna dawka"
    90.8px, "Ostatnia dawka" 84.8px and "Koniec zapasu" 76.7px, against
    "Next dose" 54.8px, "Last dose" 51.9px and "Runs out" 48.3px in English.
    Two of the widest in one row need 90.8px between their centres before
    they touch at all, which is 0.311 of 292 - so the old 0.30 was already
    3.2px short of its own rule, and only the days the demo journal happened
    to hold kept it from showing.

    0.34 is 90.8px plus 8px of air over 292px. The labels are
    `white-space: nowrap` on a row of fixed height, so a wide one cannot
    wrap its way out of a collision; the only other answer is a row.

    The cost is paid by the narrow labels: "Today" is 32.6px and now claims
    room it does not need, so a crowded lane opens a second label row sooner
    than it strictly must. A label row is what this algorithm has for
    crowding - it hangs the caption one row further from the line and keeps a
    stem back to it - so the trade is a taller lane against two captions
    printed on top of each other. */
/* MIN_LABEL_GAP stays exported only for its own test (AU-09 test-only review). */
export const MIN_LABEL_GAP = 0.34;

export type SpineMarkKind = 'labDraw' | 'lastDose' | 'today' | 'nextDose' | 'runOut';

/** Ties on the same day resolve in reading order rather than by whichever
    fact happened to be read first: a draw and a dose on one day always
    come out in the same order, so the lanes below do too. */
const KIND_ORDER: SpineMarkKind[] = ['labDraw', 'lastDose', 'today', 'nextDose', 'runOut'];

export interface SpineMark {
  kind: SpineMarkKind;
  /** The day this mark stands for, never clamped: what its label says. */
  epochDay: number;
  /** Where it is drawn, 0 at the rail's left end and 1 at its right. */
  position: number;
  /** True where `epochDay` fell outside the rail's reach, so the mark is
      drawn at the end it was pulled in to and the screen can say so. */
  beyondSpan: boolean;
  /** Which label row, counting away from the line this mark belongs to. Row
      0 sits nearest it and each row after it one further out; a caption
      takes the lowest row with space for it, and a mark pushed out keeps a
      stem back to the line. Collisions are resolved inside one lane and
      among the shared marks separately, because the two never print on the
      same row (the shared captions head the rail; a lane's hang under its
      own line). */
  labelRow: number;
}

/** One running drug's own line: its name, and its own three readings placed
    on the shared day axis. */
export interface SpineLane {
  episodeId: string;
  drug: string;
  /** Left to right. Last dose, next dose and run-out, whichever of them
      this drug has. */
  marks: SpineMark[];
}

export interface CareSpine {
  fromEpochDay: number;
  toEpochDay: number;
  /** Today's tick and the most recent draw, left to right: the marks every
      lane is read against. */
  shared: SpineMark[];
  /** One per running regimen, in `railEpisodes` order. */
  lanes: SpineLane[];
}

/** Where a day sits along the rail, 0 at its left end and 1 at its right,
    with today always at 0.5.

    The scale is the square root of the distance from today rather than the
    distance itself, and that is a design decision rather than a convenience.
    A rail linear in days is unreadable for the arrangement almost everyone
    actually has: a dose today, the next one tomorrow and a run-out three
    weeks out puts three marks inside the last few percent of the line with
    their captions over each other, while nineteen twentieths of the rail
    carries nothing. Under a root scale the near days get the room they need
    and the far ones compress toward the ends, which is the shape of the
    question - what is happening around now, and roughly how far off is the
    rest.

    What it costs is that a length along the rail is not a number of days, so
    nothing here may be read off as a measurement. That is why every caption
    prints its own date and the rail carries no axis, no ticks between the
    marks and no scale: it says order and rough nearness, and the days are
    written down beside it. The transform is monotonic, so two marks are
    never drawn out of sequence. */
function positionOf(epochDay: number, todayEpochDay: number, fromEpochDay: number, toEpochDay: number): number {
  const day = Math.min(Math.max(epochDay, fromEpochDay), toEpochDay);
  if (day === todayEpochDay) return 0.5;
  if (day < todayEpochDay) {
    const back = todayEpochDay - fromEpochDay;
    return back === 0 ? 0.5 : 0.5 - 0.5 * Math.sqrt((todayEpochDay - day) / back);
  }
  const forward = toEpochDay - todayEpochDay;
  return forward === 0 ? 0.5 : 0.5 + 0.5 * Math.sqrt((day - todayEpochDay) / forward);
}

/** One running drug's three readings, each as the day it belongs to or null
    where there is nothing to draw: no dose logged yet, no schedule to
    expect one from, no stock entry for it. */
export interface LaneFacts {
  episodeId: string;
  drug: string;
  lastDoseEpochDay: number | null;
  nextDoseEpochDay: number | null;
  runOutEpochDay: number | null;
}

/** What the whole rail is drawn from: one lane per running regimen, and the
    one reading that belongs to no lane. Today is not among them - the rail
    always has today. */
interface SpineFacts {
  labDrawEpochDay: number | null;
  lanes: readonly LaneFacts[];
}

/** The day of the most recent dose that actually happened, or null when
    none did. A skipped dose is a gap someone recorded rather than a dose,
    the same reading labTiming.ts takes of one. */
/* lastLoggedDoseDay stays exported only for its own test (AU-09 test-only
   review). */
export function lastLoggedDoseDay(doses: readonly DoseEvent[]): number | null {
  let latest: number | null = null;
  for (const dose of doses) {
    if (dose.status === 'skipped') continue;
    const day = epochDayFromTimestamp(dose.timestamp);
    if (latest === null || day > latest) latest = day;
  }
  return latest;
}

/** The first slot from here to the rail's forward reach with nothing logged
    against it, or null where the rhythm expects nothing that far out.

    `doses` are the active episode's own, attributed the way every other
    screen attributes them (regimenEpisode.ts), and `pauses` its own too:
    both are what `adherence` needs to answer which slots are still open,
    and this asks it the same question the dose log asks, over a window that
    starts today instead of ending there.

    Not a judgement about a dose being due. A slot with nothing in it is a
    slot with nothing in it; expectedAmountOn (doseSchedule.ts) reads the
    same rows the same way for the same reason. */
/* nextExpectedSlot stays exported only for its own test (AU-09 test-only
   review). */
export function nextExpectedSlot(
  schedule: DoseSchedule,
  anchorEpochDay: number,
  doses: readonly DoseEvent[],
  pauses: readonly DosePause[],
  todayEpochDay: number
): DoseSlot | null {
  const slots = expectedSlots(schedule, anchorEpochDay, todayEpochDay, todayEpochDay + SPINE_FORWARD_DAYS);
  return adherence(slots, doses, pauses).rows.find((row) => row.dose === null)?.slot ?? null;
}

/** The days one set of captions has to share, in reading order: earlier
    first, and ties in `KIND_ORDER` so a draw and a dose on one day always
    come out in the same order. */
function orderedDays(days: readonly [SpineMarkKind, number][]): [SpineMarkKind, number][] {
  return [...days].sort(([kindA, dayA], [kindB, dayB]) =>
    dayA === dayB ? KIND_ORDER.indexOf(kindA) - KIND_ORDER.indexOf(kindB) : dayA - dayB
  );
}

/** One set of captions placed along the rail, left to right.

    Rows fill from 0 up: a caption goes in the lowest row whose last caption
    is at least a label's width behind it, and opens a new row when none is.
    A fixed pair of rows was the first attempt and it was wrong - three marks
    at one point, dosed and drawn on the same day, has no two-row
    arrangement, and what it produced was two captions printed exactly over
    each other rather than a lane one row taller. So the count follows the
    arrangement, up to one row per mark, and the screen grows the lane to
    fit.

    Called once per lane and once for the shared marks, never across the two:
    a lane's captions hang under its own line and the shared ones head the
    rail, so a lane's "Next dose" cannot print over "Today" however close the
    two days are. That is what buys back the room the one-lane spine used to
    spend pushing today and next dose onto opposite sides of the line. */
function placeMarks(
  days: readonly [SpineMarkKind, number][],
  todayEpochDay: number,
  fromEpochDay: number,
  toEpochDay: number
): SpineMark[] {
  const lastInRow: number[] = [];
  return orderedDays(days).map(([kind, epochDay]) => {
    const position = positionOf(epochDay, todayEpochDay, fromEpochDay, toEpochDay);
    let labelRow = lastInRow.findIndex((last) => position - last >= MIN_LABEL_GAP);
    if (labelRow === -1) labelRow = lastInRow.length;
    lastInRow[labelRow] = position;
    return { kind, epochDay, position, beyondSpan: epochDay < fromEpochDay || epochDay > toEpochDay, labelRow };
  });
}

/** One lane's own three days, whichever of them it has. */
function laneDays(lane: LaneFacts): [SpineMarkKind, number][] {
  const days: [SpineMarkKind, number][] = [];
  if (lane.lastDoseEpochDay !== null) days.push(['lastDose', lane.lastDoseEpochDay]);
  if (lane.nextDoseEpochDay !== null) days.push(['nextDose', lane.nextDoseEpochDay]);
  if (lane.runOutEpochDay !== null) days.push(['runOut', lane.runOutEpochDay]);
  return days;
}

/** The rail, or null where there is nothing to put on one.

    Today alone is not a rail: a line with a single tick in the middle of it
    is a decoration, and the screen has an empty state for that case which
    says what would fill it. A lane with no mark of its own is the same
    silence one drug at a time - a running regimen nothing has been logged
    against yet - so it draws no line either, and its block below still names
    the regimen.

    Every lane shares one day axis, which is the whole point of drawing them
    together: two drugs' next doses are only comparable if the same distance
    along the rail means the same day on both. So the span is taken across
    every lane's marks at once, and a lane whose own days are all near today
    still gets drawn against the reach a far-off run-out on another lane
    opened up. */
export function careSpine(facts: SpineFacts, todayEpochDay: number): CareSpine | null {
  const sharedDays: [SpineMarkKind, number][] = [['today', todayEpochDay]];
  if (facts.labDrawEpochDay !== null) sharedDays.push(['labDraw', facts.labDrawEpochDay]);

  const laneEntries = facts.lanes.map((lane) => ({ lane, days: laneDays(lane) })).filter(({ days }) => days.length > 0);
  const everyDay = [...sharedDays, ...laneEntries.flatMap(({ days }) => days)];
  if (everyDay.length < 2) return null;

  const earliest = Math.min(...everyDay.map(([, day]) => day));
  const latest = Math.max(...everyDay.map(([, day]) => day));
  const fromEpochDay = Math.max(todayEpochDay - SPINE_BACK_DAYS, Math.min(todayEpochDay - SPINE_MIN_BACK_DAYS, earliest));
  const toEpochDay = Math.min(todayEpochDay + SPINE_FORWARD_DAYS, Math.max(todayEpochDay + SPINE_MIN_FORWARD_DAYS, latest));

  return {
    fromEpochDay,
    toEpochDay,
    shared: placeMarks(sharedDays, todayEpochDay, fromEpochDay, toEpochDay),
    lanes: laneEntries.map(({ lane, days }) => ({
      episodeId: lane.episodeId,
      drug: lane.drug,
      marks: placeMarks(days, todayEpochDay, fromEpochDay, toEpochDay)
    }))
  };
}

/** Every running episode, in the order their lanes are drawn.

    One lane per running drug (phase 11 ticket 10), which is what replaced
    `chooseRailEpisode`. That function picked one episode for the rail and
    handed the rest back as `others`, because a single-lane rail's captions
    carried no episode: two marks of the same kind would have been two
    unlabelled dates with no way to tell them apart, so with two curve
    episodes running it drew neither. A lane per drug, each labelled with its
    drug's name, answers that ambiguity in the drawing instead of by dropping
    regimens out of it. One stripe per drug and no drug primary: colour here
    is categorical the way it is everywhere else in this app, which is
    ADR-0012's line - a scale with a better end is the judgement it forbids,
    and three drugs somebody takes have no better end.

    Curve drugs first, so the lane the hormone curve reads sits nearest the
    labs row under the rail, then by start day, oldest first - the order the
    regimen list already reads in. Neither is a ranking: the order exists so
    the lanes do not reshuffle under somebody between two visits. */
export function railEpisodes(activeEpisodes: readonly RegimenEpisode[]): RegimenEpisode[] {
  return [...activeEpisodes].sort((a, b) => {
    const curveA = resolveCurveDrug(a.drug) === null ? 1 : 0;
    const curveB = resolveCurveDrug(b.drug) === null ? 1 : 0;
    return curveA === curveB ? a.startEpochDay - b.startEpochDay : curveA - curveB;
  });
}

/** One episode's own last and next dose, scoped so a second, unrelated
    concurrent schedule cannot bleed into either reading - the bug ticket
    38 is named for.

    Last reads by drug name (attributeDrug) rather than by this exact
    episode row: a dose logged under an earlier episode of the same drug,
    before a dose change split it into a new row, still counts, the same
    continuity nextExpectedSlot already gets from anchoring on the
    episode's own startEpochDay rather than the schedule's edit day. A
    concurrent episode for a different drug resolves to its own name
    instead (attributeDose/attributeDrug, regimenEpisode.ts) and so never
    counts here, which is the fix itself - the whole-log scan this
    replaced could not tell the two apart.

    Next reads by this exact episode's own id (attributeDose), unchanged
    from before this ticket: only a slot this episode's own rhythm expects,
    from today, is its "next" one. `doses` is the whole log, unbounded by
    date - both halves do their own scoping over it. */
export function scheduleDoseFacts(
  episode: RegimenEpisode,
  episodes: readonly RegimenEpisode[],
  schedule: DoseSchedule | null,
  doses: readonly DoseEvent[],
  pauses: readonly DosePause[],
  todayEpochDay: number
): { lastDoseEpochDay: number | null; nextDoseEpochDay: number | null } {
  const drug = episode.drug.trim();
  const ownDoses = doses.filter((dose) => attributeDrug(episodes, dose).drug?.trim() === drug);
  const lastDoseEpochDay = lastLoggedDoseDay(ownDoses);

  if (!schedule) return { lastDoseEpochDay, nextDoseEpochDay: null };

  const dosesFromToday = doses.filter(
    (dose) =>
      epochDayFromTimestamp(dose.timestamp) >= todayEpochDay &&
      attributeDose(episodes, dose).episode?.id === episode.id
  );
  const nextSlot = nextExpectedSlot(schedule, episode.startEpochDay, dosesFromToday, pauses, todayEpochDay);
  return { lastDoseEpochDay, nextDoseEpochDay: nextSlot?.epochDay ?? null };
}
