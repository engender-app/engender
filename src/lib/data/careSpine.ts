/* Place care dates on one rail without reading the clock or journal.
   Dose log, schedule, lab results and stock projection provide the
   dates. This module positions them, clamps them and spaces captions.
   Marks carry a day and a kind. Copy describes timing without grading
   it or prescribing an interval. */

import { adherence, expectedSlots, slotToleranceDays, type DoseSlot } from './doseSchedule';
import { pairDoseSchedule } from './journal/doses';
import { epochDayFromTimestamp } from './epochDay';
import { attributeDose, attributeDrug, sameDrug } from './regimenEpisode';
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
/* SPINE_BACK_DAYS stays exported only for its own test. */
export const SPINE_BACK_DAYS = 60;
export const SPINE_FORWARD_DAYS = 120;

/** The least the rail spans either side of today, whatever the marks say.

    Without a floor a rail whose only other mark is tomorrow would span two
    days, and today's tick would sit hard against the left edge with the
    next dose against the right - two marks at the ends of a line, which
    says nothing about the gap between them. A fortnight each way gives
    every arrangement a middle to be near. */
/* SPINE_MIN_BACK_DAYS, SPINE_MIN_FORWARD_DAYS stay exported only for their own test. */
export const SPINE_MIN_BACK_DAYS = 14;
export const SPINE_MIN_FORWARD_DAYS = 14;

/** Minimum gap between label centers as a fraction of rail width. At
    390px, care-lane-labels.mjs measured a 292px rail and a 90.8px Polish
    Next dose label. A 0.34 gap leaves about 8px of air. The labels cannot
    wrap, so crowding moves a label to a higher row. Shorter labels use
    the same gap. */
/* MIN_LABEL_GAP stays exported only for its own test. */
export const MIN_LABEL_GAP = 0.34;

/** Compute caption spacing from measured rail width. The widest
    label needs 90.8px plus 8px of space and must still take a 48px
    target. Before measurement use the fraction for a 292px rail.
    At 200% zoom a 390px phone can leave only 97px of rail, so use
    separate rows when captions cannot share one.
    tests/timeline-fact-selection.mjs checks both widths. */
export const MIN_LABEL_PX = 99;

/** The collision rule for a rail of a known width. */
function labelGapFor(railWidthPx: number | null | undefined): number {
  return railWidthPx && railWidthPx > 0 ? MIN_LABEL_PX / railWidthPx : MIN_LABEL_GAP;
}

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
  /** The backing journal record the mark stands for - a dose event or a
      lab result - or null where the kind has none (today, next dose,
      run-out). */
  recordId: string | null;
}

/** One running drug's own line: its name, and its own three readings placed
    on the shared day axis. */
interface SpineLane {
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

/** Map signed distance from today through a square root, with today
    at 0.5 and the ends at 0 and 1. Near dates gain room for labels and
    far dates compress without changing order. Captions carry actual
    dates. Distances on the rail show rough nearness, so omit an axis
    and intermediate ticks. */
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
  lastDoseId?: string | null;
  nextDoseEpochDay: number | null;
  runOutEpochDay: number | null;
}

/** What the whole rail is drawn from: one lane per running regimen, and the
    one reading that belongs to no lane. Today is not among them - the rail
    always has today. */
interface SpineFacts {
  labDrawEpochDay: number | null;
  labDrawId?: string | null;
  lanes: readonly LaneFacts[];
}

/** The most recent dose that actually happened, or null when none did. */
function lastLoggedDose(doses: readonly DoseEvent[]): DoseEvent | null {
  let latest: DoseEvent | null = null;
  for (const dose of doses) {
    if (dose.status === 'skipped') continue;
    if (latest === null || dose.timestamp > latest.timestamp) latest = dose;
  }
  return latest;
}

/** The day of the most recent dose that actually happened, or null when
    none did. A skipped dose is a gap someone recorded rather than a dose,
    the same reading labTiming.ts takes of one. */
/* lastLoggedDoseDay stays exported only for its own test. */
export function lastLoggedDoseDay(doses: readonly DoseEvent[]): number | null {
  const latest = lastLoggedDose(doses);
  return latest ? epochDayFromTimestamp(latest.timestamp) : null;
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
/* nextExpectedSlot stays exported only for its own test. */
export function nextExpectedSlot(
  schedule: DoseSchedule,
  anchorEpochDay: number,
  doses: readonly DoseEvent[],
  pauses: readonly DosePause[],
  todayEpochDay: number
): DoseSlot | null {
  const slots = expectedSlots(schedule, anchorEpochDay, todayEpochDay, todayEpochDay + SPINE_FORWARD_DAYS);
  return adherence(slots, doses, pauses, slotToleranceDays(schedule), schedule.episodeId).rows.find((row) => row.dose === null)?.slot ?? null;
}

type MarkEntry = { kind: SpineMarkKind; epochDay: number; recordId?: string | null };

/** The days one set of captions has to share, in reading order: earlier
    first, and ties in `KIND_ORDER` so a draw and a dose on one day always
    come out in the same order. */
function orderedDays(days: readonly MarkEntry[]): MarkEntry[] {
  return [...days].sort((a, b) =>
    a.epochDay === b.epochDay ? KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) : a.epochDay - b.epochDay
  );
}

/** Place captions left to right in the lowest row with enough room.
    Add rows as needed, up to one per mark at a shared position.
    Call separately for each lane and for shared marks, so the
    screen can grow each caption group without crowding another. */
function placeMarks(
  days: readonly MarkEntry[],
  todayEpochDay: number,
  fromEpochDay: number,
  toEpochDay: number,
  minLabelGap: number
): SpineMark[] {
  const lastInRow: number[] = [];
  return orderedDays(days).map(({ kind, epochDay, recordId }) => {
    const position = positionOf(epochDay, todayEpochDay, fromEpochDay, toEpochDay);
    let labelRow = lastInRow.findIndex((last) => position - last >= minLabelGap);
    if (labelRow === -1) labelRow = lastInRow.length;
    lastInRow[labelRow] = position;
    return {
      kind,
      epochDay,
      position,
      beyondSpan: epochDay < fromEpochDay || epochDay > toEpochDay,
      labelRow,
      recordId: recordId ?? null
    };
  });
}

/** One lane's own three days, whichever of them it has. */
function laneDays(lane: LaneFacts): MarkEntry[] {
  const days: MarkEntry[] = [];
  if (lane.lastDoseEpochDay !== null) days.push({ kind: 'lastDose', epochDay: lane.lastDoseEpochDay, recordId: lane.lastDoseId ?? null });
  if (lane.nextDoseEpochDay !== null) days.push({ kind: 'nextDose', epochDay: lane.nextDoseEpochDay });
  if (lane.runOutEpochDay !== null) days.push({ kind: 'runOut', epochDay: lane.runOutEpochDay });
  return days;
}

/** The rail, or null where there is nothing to put on one.

    Today alone is not a rail: a line with a single tick in the middle of it
    is a decoration, so the screen omits the timeline in that case.
    A lane with no mark of its own is the same
    silence one drug at a time - a running regimen nothing has been logged
    against yet - so it draws no line either, and its block below still names
    the regimen.

    Every lane shares one day axis, which is the whole point of drawing them
    together: two drugs' next doses are only comparable if the same distance
    along the rail means the same day on both. So the span is taken across
    every lane's marks at once, and a lane whose own days are all near today
    still gets drawn against the reach a far-off run-out on another lane
    opened up. */
export function careSpine(
  facts: SpineFacts,
  todayEpochDay: number,
  /** The rail's own drawn width in CSS pixels, where the screen has
      measured it: what the collision rule is computed from. */
  railWidthPx?: number | null
): CareSpine | null {
  const sharedDays: MarkEntry[] = [{ kind: 'today', epochDay: todayEpochDay }];
  if (facts.labDrawEpochDay !== null) sharedDays.push({ kind: 'labDraw', epochDay: facts.labDrawEpochDay, recordId: facts.labDrawId ?? null });

  const laneEntries = facts.lanes.map((lane) => ({ lane, days: laneDays(lane) })).filter(({ days }) => days.length > 0);
  const everyDay = [...sharedDays, ...laneEntries.flatMap(({ days }) => days)];
  if (everyDay.length < 2) return null;

  const earliest = Math.min(...everyDay.map(({ epochDay }) => epochDay));
  const latest = Math.max(...everyDay.map(({ epochDay }) => epochDay));
  const fromEpochDay = Math.max(todayEpochDay - SPINE_BACK_DAYS, Math.min(todayEpochDay - SPINE_MIN_BACK_DAYS, earliest));
  const toEpochDay = Math.min(todayEpochDay + SPINE_FORWARD_DAYS, Math.max(todayEpochDay + SPINE_MIN_FORWARD_DAYS, latest));

  const minLabelGap = labelGapFor(railWidthPx);
  return {
    fromEpochDay,
    toEpochDay,
    shared: placeMarks(sharedDays, todayEpochDay, fromEpochDay, toEpochDay, minLabelGap),
    lanes: laneEntries.map(({ lane, days }) => ({
      episodeId: lane.episodeId,
      drug: lane.drug,
      marks: placeMarks(days, todayEpochDay, fromEpochDay, toEpochDay, minLabelGap)
    }))
  };
}

/** Every running episode, in the order their lanes are drawn.

    One lane per running drug, which is what replaced
    `chooseRailEpisode`. That function picked one episode for the rail and
    handed the rest back as `others`, because a single-lane rail's captions
    carried no episode: two marks of the same kind would have been two
    unlabelled dates with no way to tell them apart. A lane per drug, each labelled with its
    drug's name, answers that ambiguity in the drawing instead of by dropping
    regimens out of it. One stripe per drug and no drug primary: colour here
    is categorical the way it is everywhere else in this app, which is
    ADR-0012's line - a scale with a better end is the judgement it forbids,
    and three drugs somebody takes have no better end.

    Start day, oldest first, matches the regimen list. The order exists so
    lanes do not reshuffle under somebody between two visits. */
export function railEpisodes(activeEpisodes: readonly RegimenEpisode[]): RegimenEpisode[] {
  return [...activeEpisodes].sort((a, b) => a.startEpochDay - b.startEpochDay);
}

/** Read the last dose through today by drug so an earlier episode of that drug
    still counts. Read the next slot by episode ID. The dose range includes
    forward reach and tolerance on either side for pairing. */
export function scheduleDoseFacts(
  episode: RegimenEpisode,
  episodes: readonly RegimenEpisode[],
  schedule: DoseSchedule | null,
  doses: readonly DoseEvent[],
  pauses: readonly DosePause[],
  todayEpochDay: number
): { lastDoseEpochDay: number | null; lastDoseId: string | null; nextDoseEpochDay: number | null } {
  const ownDoses = doses.filter((dose) => {
    const { drug } = attributeDrug(episodes, dose);
    return drug !== null && sameDrug(drug, episode.drug);
  });
  const lastDose = lastLoggedDose(ownDoses.filter((dose) => epochDayFromTimestamp(dose.timestamp) <= todayEpochDay));
  const lastDoseEpochDay = lastDose ? epochDayFromTimestamp(lastDose.timestamp) : null;
  const lastDoseId = lastDose?.id ?? null;

  if (!schedule) return { lastDoseEpochDay, lastDoseId, nextDoseEpochDay: null };

  const nextSlot = pairDoseSchedule(episodes, doses, schedule, pauses, todayEpochDay,
    todayEpochDay + SPINE_FORWARD_DAYS).rows.find((row) => row.dose === null)?.slot ?? null;
  return { lastDoseEpochDay, lastDoseId, nextDoseEpochDay: nextSlot?.epochDay ?? null };
}
