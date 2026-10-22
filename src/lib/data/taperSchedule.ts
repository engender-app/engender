/* Expected dilation sessions, from a taper's stages (phase 8 features
   ticket 12, CONTEXT: "Taper"). Pure, kept above the journal seam next to
   doseSchedule.ts for the same reason: a session is a question about a
   schedule and a day, not a row anyone stores (ADR-0010). Nothing here
   reads a clock or a database.

   Deliberately no verdict, the same refusal doseSchedule.ts makes: this
   answers "what day was a session expected", and stops. Whether one was
   logged against it, and what that means, is the screen's own question. */

import type { Procedure, Taper, TaperStage } from './types';

/** Whether a procedure is one dilation can follow (audit item 7): the
    surgery screen's own gate for offering the Dilation row at all
    (surgery/+page.svelte), and the schedule editor's own gate for which
    procedures it offers a taper to name (dilation/+page.svelte). Only a
    `custom` kind carries its own opt-in - none of the compiled-in kinds
    can be guessed to include dilation except vaginoplasty (types.ts's own
    note on `Procedure`). Named once so the two screens and schema v83's
    migration cannot drift on what "eligible" means. */
export function dilationEligible(procedure: Pick<Procedure, 'kind' | 'dilationOptIn'>): boolean {
  return procedure.kind === 'vaginoplasty' || (procedure.kind === 'custom' && procedure.dilationOptIn);
}

/** The days `stages` expects a session on, starting at `startEpochDay` and
    stopping at `todayEpochDay` - never past it, since a taper has no
    schedule for a day that has not arrived yet.

    Stages run back to back: the next one's first day is the day after the
    previous one's last, in the order they are declared, regardless of that
    stage's own frequency. A stage with `everyNDays` under 1 expects no
    sessions but still holds its `days` for the stages after it, the way a
    rest stretch a surgeon writes into the plan would - and a stage with no
    days at all contributes nothing and is skipped outright, rather than
    either treated as an error a typed-in plan has no way to raise. */
export function expectedSessionDays(
  taper: Pick<Taper, 'startEpochDay' | 'stages'>,
  todayEpochDay: number
): number[] {
  const days: number[] = [];
  let cursor = taper.startEpochDay;

  for (const stage of taper.stages) {
    if (stage.days < 1) continue;

    if (stage.everyNDays >= 1) {
      for (let day = cursor; day < cursor + stage.days; day += stage.everyNDays) {
        if (day > todayEpochDay) return days;
        if (day >= taper.startEpochDay) days.push(day);
      }
    }

    cursor += stage.days;
  }

  return days;
}

/** The most sessions a day one stage can ask for. Schedules are given as
    three to five a day; the ceiling is there so a count read off an archive
    the editor never wrote cannot ask a screen for a billion rows. */
export const MAX_TIMES_PER_DAY = 10;

/** How many sessions each expected day of `stage` holds: its own
    `timesPerDay` when that is a whole count the editor could have saved,
    the ceiling when it is larger, and one otherwise. */
function sessionsPerDay(stage: TaperStage): number {
  const times = stage.timesPerDay;
  if (typeof times !== 'number' || !Number.isInteger(times) || times < 1) return 1;
  return Math.min(times, MAX_TIMES_PER_DAY);
}

/** The stage `epochDay` falls in, with the day that stage starts on, or
    null before the taper starts and after its last stage ends. */
function placeOf(taper: Pick<Taper, 'startEpochDay' | 'stages'>, epochDay: number) {
  let cursor = taper.startEpochDay;
  if (epochDay < cursor) return null;
  for (const stage of taper.stages) {
    if (stage.days < 1) continue;
    if (epochDay < cursor + stage.days) return { stage, firstDay: cursor };
    cursor += stage.days;
  }
  return null;
}

/** The stage the schedule is in on `epochDay` (the schedule row's own
    words for "now", dilation/+page.svelte), or null outside it. */
export function stageOn(taper: Pick<Taper, 'startEpochDay' | 'stages'>, epochDay: number): TaperStage | null {
  return placeOf(taper, epochDay)?.stage ?? null;
}

/** How many sessions the schedule expects on `epochDay`: none on a day
    outside it, in a rest stage or between an every-N-days stage's days,
    and the stage's count on every other day. Arithmetic over one day, with
    no notion of today - the caller decides which days it asks about. */
export function sessionsExpectedOn(taper: Pick<Taper, 'startEpochDay' | 'stages'>, epochDay: number): number {
  const place = placeOf(taper, epochDay);
  if (!place || !(place.stage.everyNDays >= 1)) return 0;
  return (epochDay - place.firstDay) % place.stage.everyNDays === 0 ? sessionsPerDay(place.stage) : 0;
}

/** Which of a day's expected sessions a row stands for: "2 of 3". Null on
    a day that expects one or none, and on a session past the day's count,
    which is still a session but not one the schedule asked for. */
export type SessionSlotNumber = { index: number; count: number } | null;

/** A day's rows: one per expected session, filled by the day's sessions in
    the order they were logged, and one more for each session past the
    count. The dilation screen draws the empty ones as gaps (ADR-0010);
    the day view keeps only the filled ones. */
export function sessionSlots<T>(sessions: readonly T[], expected: number): { session: T | null; slot: SessionSlotNumber }[] {
  return Array.from({ length: Math.max(expected, sessions.length) }, (_, i) => ({
    session: sessions[i] ?? null,
    slot: expected > 1 && i < expected ? { index: i + 1, count: expected } : null
  }));
}

/** A typed-in number, or null when nothing usable was typed. A
    `type=number bind:value` field hands over null once emptied and '' before
    it was ever touched, and Number() reads both as 0. */
function typedNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** The schedule editor's stages as a taper stores them, or null when any
    row is unfinished (dilation/+page.svelte). A frequency of 0 is a real
    rest stage, so only a missing or negative one is refused, and a stage
    needs at least one day. A cleared frequency used to read as 0 and save
    a rest stage nobody asked for (after-release ticket 01).

    A row that carries `timesPerDay` is a times-a-day stage (functional
    audit ticket 25): its frequency field is not read, the count has to be
    a whole number from 1 to `MAX_TIMES_PER_DAY`, and it saves as a daily
    stage with that count. */
export function stagesFromInput(
  inputs: readonly { everyNDays: unknown; days: unknown; timesPerDay?: unknown }[]
): TaperStage[] | null {
  if (inputs.length === 0) return null;
  const stages: TaperStage[] = [];
  for (const input of inputs) {
    const days = typedNumber(input.days);
    if (days === null || days <= 0) return null;
    if (input.timesPerDay !== undefined) {
      const timesPerDay = typedNumber(input.timesPerDay);
      if (timesPerDay === null || !Number.isInteger(timesPerDay) || timesPerDay < 1 || timesPerDay > MAX_TIMES_PER_DAY) return null;
      stages.push({ everyNDays: 1, timesPerDay, days });
      continue;
    }
    const everyNDays = typedNumber(input.everyNDays);
    if (everyNDays === null || everyNDays < 0) return null;
    stages.push({ everyNDays, days });
  }
  return stages;
}

export type { TaperStage };
