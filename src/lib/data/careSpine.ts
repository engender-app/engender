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
export const SPINE_BACK_DAYS = 60;
export const SPINE_FORWARD_DAYS = 120;

/** The least the rail spans either side of today, whatever the marks say.

    Without a floor a rail whose only other mark is tomorrow would span two
    days, and today's tick would sit hard against the left edge with the
    next dose against the right - two marks at the ends of a line, which
    says nothing about the gap between them. A fortnight each way gives
    every arrangement a middle to be near. */
export const SPINE_MIN_BACK_DAYS = 14;
export const SPINE_MIN_FORWARD_DAYS = 14;

/** How close two labels may sit in the same lane, as a fraction of the
    rail. A date label is around 48px wide and a mark owes a 48px target
    (PRODUCT.md's floor), so at the 330px of rail a 390px screen leaves,
    0.17 is about the 56px two adjacent labels need to stay apart. */
export const MIN_LABEL_GAP = 0.17;

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
  /** Which label lane. Lane 0 sits nearest the line and every lane after it
      one row further out, alternating sides so lane 1 stands above the line
      rather than forming a second row below it (the screen reads the
      parity). A caption takes the lowest lane with room for it. */
  lane: number;
}

export interface CareSpine {
  fromEpochDay: number;
  toEpochDay: number;
  /** Left to right. */
  marks: SpineMark[];
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

/** The four readings, each as the day it belongs to or null where there is
    nothing to draw: no dose logged yet, no schedule to expect one from, no
    lab result, no stock entry. Today is not among them - the rail always
    has today. */
export interface SpineFacts {
  lastDoseEpochDay: number | null;
  nextDoseEpochDay: number | null;
  labDrawEpochDay: number | null;
  runOutEpochDay: number | null;
}

/** The day of the most recent dose that actually happened, or null when
    none did. A skipped dose is a gap someone recorded rather than a dose,
    the same reading labTiming.ts takes of one. */
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

/** The rail, or null where there is nothing to put on one.

    Today alone is not a rail: a line with a single tick in the middle of it
    is a decoration, and the screen has an empty state for that case which
    says what would fill it. */
export function careSpine(facts: SpineFacts, todayEpochDay: number): CareSpine | null {
  const days: [SpineMarkKind, number][] = [['today', todayEpochDay]];
  if (facts.labDrawEpochDay !== null) days.push(['labDraw', facts.labDrawEpochDay]);
  if (facts.lastDoseEpochDay !== null) days.push(['lastDose', facts.lastDoseEpochDay]);
  if (facts.nextDoseEpochDay !== null) days.push(['nextDose', facts.nextDoseEpochDay]);
  if (facts.runOutEpochDay !== null) days.push(['runOut', facts.runOutEpochDay]);
  if (days.length < 2) return null;

  days.sort(([kindA, dayA], [kindB, dayB]) =>
    dayA === dayB ? KIND_ORDER.indexOf(kindA) - KIND_ORDER.indexOf(kindB) : dayA - dayB
  );

  const earliest = Math.min(...days.map(([, day]) => day));
  const latest = Math.max(...days.map(([, day]) => day));
  const fromEpochDay = Math.max(todayEpochDay - SPINE_BACK_DAYS, Math.min(todayEpochDay - SPINE_MIN_BACK_DAYS, earliest));
  const toEpochDay = Math.min(todayEpochDay + SPINE_FORWARD_DAYS, Math.max(todayEpochDay + SPINE_MIN_FORWARD_DAYS, latest));

  /* Lanes, filled left to right: a caption goes in the lowest lane whose
     last caption is at least a label's width behind it, and opens a new lane
     when none is. A fixed pair of lanes was the first attempt and it was
     wrong - three marks at one point, dosed and drawn on the same day, has
     no two-lane arrangement, and what it produced was two captions printed
     exactly over each other rather than a rail one row taller.

     So the count follows the arrangement, up to one lane per mark, and the
     screen grows the rail to fit. Lanes fill from 0 up, so a journal whose
     marks are spread out still gets a one-lane rail. */
  const lastInLane: number[] = [];
  const marks: SpineMark[] = days.map(([kind, epochDay]) => {
    const position = positionOf(epochDay, todayEpochDay, fromEpochDay, toEpochDay);
    let lane = lastInLane.findIndex((last) => position - last >= MIN_LABEL_GAP);
    if (lane === -1) lane = lastInLane.length;
    lastInLane[lane] = position;
    return { kind, epochDay, position, beyondSpan: epochDay < fromEpochDay || epochDay > toEpochDay, lane };
  });

  return { fromEpochDay, toEpochDay, marks };
}

/** Which of several active episodes draws the rail, and which fall to their
    own line beneath it (ticket 38, "the spine assumes one dose a day").
    The rail draws one schedule's last/next dose or none at all - its
    captions carry no episode, so two marks of the same kind would be two
    unlabelled dates with no way to tell them apart. A single active
    episode of any drug is unambiguous and keeps every existing journal's
    rail exactly as it read before this ticket.

    With several active at once, the curve drug - the one this app models a
    hormone level from (hormoneDrug.ts) - is the one whose timing the rail
    exists to show, so it wins when there is exactly one. Two curve
    episodes active together (switching hormones) is the one case
    genuinely ambiguous, same as "several regimens" always read: the rail
    draws neither, and every active episode - including the two competing
    ones - falls to its own row instead of the rail naming nothing at all. */
export function chooseRailEpisode(activeEpisodes: readonly RegimenEpisode[]): {
  rail: RegimenEpisode | null;
  others: RegimenEpisode[];
  ambiguous: boolean;
} {
  if (activeEpisodes.length <= 1) {
    return { rail: activeEpisodes[0] ?? null, others: [], ambiguous: false };
  }

  const curveEpisodes = activeEpisodes.filter((episode) => resolveCurveDrug(episode.drug) !== null);
  if (curveEpisodes.length !== 1) {
    return { rail: null, others: [...activeEpisodes], ambiguous: true };
  }

  const rail = curveEpisodes[0];
  return { rail, others: activeEpisodes.filter((episode) => episode.id !== rail.id), ambiguous: false };
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
