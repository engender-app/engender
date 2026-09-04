/* What is waiting when somebody opens the app after a long time away
   (phase 8 features ticket 05, ADR-0062, ADR-0039, ADR-0045, ADR-0010).

   Every living tracker treats a stopped stream as a lapse. For a transition
   that is false in a specific way: a five-week gap is usually a hard month
   and sometimes a good one, and in neither case is it a debt. So this
   module answers one question - given the last write in every area and a
   set of things the journal already holds, what is *waiting* - and it is
   written so that the answer can never be a count of what did not happen.

   ## The tension this resolves, because it was live before it was built

   An earlier product pass argued that gaps mean something and should stay
   visible as gaps, which points the opposite way from smoothing a return.
   Both hold, and the line between them is drawn here rather than in the
   copy: the record keeps its holes - nothing below writes anything, no
   chart is filled in, and a backfilled dose fills exactly the one slot it
   was logged against - while this surface reports what is *waiting* and
   never what is missing.

   Three shapes fall out of that line, and they are the whole design:

   - **Nothing here is a total.** No field counts unlogged slots, elapsed
     days or absent entries. There is no number to render because there is
     no number.
   - **One dose slot, not the twelve that passed.** The most recent one, and
     answering it does not promote the next: `whatIsWaiting` is asked once
     per return (see ADR-0062 on the return moment), so logging one dose
     cannot queue a question about the other eleven. That criterion is the
     ticket's, and this is where it is kept.
   - **What arrived comes before what can be tidied.** A letter that
     unlocked and a milestone date that came are things the journal was
     holding *for* the person; a running timer and an unlogged slot are
     housekeeping. Reading the housekeeping first would make the screen a
     to-do list, which is the failure mode the whole ticket is against.

   ## Nothing new is stored

   Every fact below is read off a row that already exists (ADR-0010): a
   letter's unlock day, a milestone's day, an era with no end, a wear
   session with no duration, and the schedule's own slots through
   `doses.getComparison`. The gap itself comes from `journal/lastWrite.ts`,
   which is the seam ticket 03 built for exactly this. No column, no flag,
   no "last seen" row anywhere in SQLite.

   What *is* stored is one preference: the return this person has already
   met (`comingBackSeenSince`), which is what makes the surface a moment
   rather than a place. That is a record of what the app has shown, not a
   derived fact about the journal, and it lives beside
   `areaFinishOfferDeclined` for the same reason.

   ## Pure, and today is an argument

   No clock read, no journal handle, no paraglide: the selection is the part
   with the thresholds in it and it is tested with no driver, the shape
   `liveTiles.ts`'s `shouldShow*` predicates and `areaGroups.ts`'s
   `shouldOfferFinish` already have. Relative imports for the same reason
   they use them - the Node tier has no `$lib` alias.

   The reads that feed it live in `comingBackReads.ts`, so this file can be
   read on the Node tier while that one names the journal. */

import { epochDayFromTimestamp } from './epochDay';
import type { DoseScheduleComparison } from './journal/doses';
import { eraCoversDay } from './eras';
import type { DoseRoute, Era, Letter, Milestone, WearSession } from './types';

/** How long a gap has to be before returning is treated as a return.

    Three weeks. The number is a judgement, like
    `FINISH_SUGGESTION_QUIET_DAYS`, and what it is judged against is what
    the app's own everyday surfaces can still show: Home's week strip
    covers seven days and the calendar's heat map one month, so a gap under
    three weeks is still a stretch the person can scroll to and read for
    themselves. Past three weeks the gap spans more than one month grid and
    a letter that unlocked inside it has been sitting unopened for a
    fortnight.

    Two weeks would fire on a holiday. A month would be long enough that
    the arithmetic stops being the point: by then the person has been gone
    long enough that they know it.

    What keeps a wrong number from mattering much is structural rather than
    numeric, the same way it is for the finish suggestion. This surface is
    reached once per gap (ADR-0062), it is never a notification, and every
    row on it can be left alone. Wrong by a few days means one screen shown
    a little early or a little late, once. */
export const RETURN_GAP_DAYS = 21;

/** How many rows one kind may contribute.

    A doorway, not an inbox. Somebody back after a year could have eight
    unlocked letters, and eight rows of them is a wall in front of a person
    who has just opened the app after a hard season. Three is what fits
    above the fold at 390px, and the screen that owns each kind is one tap
    from every row, so nothing is hidden - it is just not all here.

    Deliberately no "and four more": that is a count, and a count of what
    was waiting is one editing pass away from a count of what was
    missed. */
export const WAITING_PER_KIND = 3;

/** One thing the journal is holding. Each arm carries only what its own
    row needs, so nothing can render a field another kind would have had to
    leave null - and so a screen narrowing on `kind` is left with `never`
    at the end of its chain if a kind is added and not handled. */
export type WaitingItem =
  | { kind: 'letter'; letterId: string; unlockEpochDay: number }
  | { kind: 'milestone'; milestoneId: string; name: string; epochDay: number }
  | { kind: 'era'; eraId: string; name: string; startEpochDay: number | null }
  | { kind: 'wear-session'; sessionId: string; startEpochDay: number }
  | {
      kind: 'dose';
      slotEpochDay: number;
      episodeId: string;
      route: DoseRoute;
      /** What the schedule was expecting in that slot, so the offer's sheet
          fills in a figure the person chose rather than one it invented -
          the slot's own amount where the schedule cycles them, and the
          episode's otherwise. */
      dose: number;
      doseUnit: string;
    };

/** Everything `whatIsWaiting` reads. Rows arrive already fetched, the way
    every `shouldShow*` predicate takes them, and each one is narrowed to
    the fields the selection actually uses. */
export interface ComingBackInput {
  todayEpochDay: number;
  /** From `journal/lastWrite.ts`. `Partial` because a caller may hand in a
      subset in a test, and an area this build does not know about simply
      does not vote. */
  lastWrites: Partial<Record<string, number | null>>;
  letters: readonly Pick<Letter, 'id' | 'unlockEpochDay'>[];
  milestones: readonly Pick<Milestone, 'id' | 'name' | 'epochDay'>[];
  eras: readonly Pick<Era, 'id' | 'name' | 'startEpochDay' | 'endEpochDay'>[];
  runningWearSession: Pick<WearSession, 'id' | 'startTimestamp'> | null;
  /** `doses.getComparison` over the gap window. Its union already carries
      the reasons there is nothing to compare against, so this file asks
      about doses only in the one arm where a schedule exists. */
  doses: DoseScheduleComparison;
}

export interface ComingBack {
  /** The day of the last write before the gap. The return's own identity:
      what `comingBackSeenSince` stores, and so what makes this return one
      the person has already met or a new one. */
  sinceEpochDay: number;
  items: WaitingItem[];
}

/** The newest day any area answers with, or null where none does.

    A journal is written to in whichever area the person felt like that day,
    so the gap is the newest write anywhere and not any one area's. An area
    that answers null - nothing ever written there, or a deliberate opt-out
    from the registry - does not drag the gap backwards. */
export function lastWriteDay(lastWrites: Partial<Record<string, number | null>>): number | null {
  let newest: number | null = null;
  for (const day of Object.values(lastWrites)) {
    if (day === null || day === undefined) continue;
    if (newest === null || day > newest) newest = day;
  }
  return newest;
}

/** The most recent rows first, capped. Newest rather than oldest because
    the newest arrival is the one the person has not met yet; the oldest is
    the one they were nearest to seeing before they stopped. */
function newestFew<T>(items: T[], dayOf: (item: T) => number): T[] {
  return [...items].sort((a, b) => dayOf(b) - dayOf(a)).slice(0, WAITING_PER_KIND);
}

/** What was waiting when the person came back, or null if this is not a
    return at all.

    Null in three cases, and all three are "there is nothing to show" rather
    than "the threshold said no": a journal never written to, a gap shorter
    than `RETURN_GAP_DAYS`, and a long gap in which nothing actually arrived
    and nothing is left open. The third is the one worth naming - a person
    can be away for three months and have the app hold nothing for them,
    and the honest thing then is no screen. */
export function whatIsWaiting(input: ComingBackInput): ComingBack | null {
  const since = lastWriteDay(input.lastWrites);
  if (since === null) return null;
  if (input.todayEpochDay - since < RETURN_GAP_DAYS) return null;

  const items: WaitingItem[] = [];
  /* The window nobody was looking at: the day after the last write, up to
     and including today. A letter that unlocks this morning is as much a
     thing waiting as one that unlocked three weeks ago. */
  const arrivedInGap = (epochDay: number) => epochDay > since && epochDay <= input.todayEpochDay;

  for (const letter of newestFew(
    input.letters.filter((letter) => arrivedInGap(letter.unlockEpochDay)),
    (letter) => letter.unlockEpochDay
  )) {
    items.push({ kind: 'letter', letterId: letter.id, unlockEpochDay: letter.unlockEpochDay });
  }

  for (const milestone of newestFew(
    input.milestones.filter((milestone) => arrivedInGap(milestone.epochDay)),
    (milestone) => milestone.epochDay
  )) {
    items.push({
      kind: 'milestone',
      milestoneId: milestone.id,
      name: milestone.name,
      epochDay: milestone.epochDay
    });
  }

  /* The era the person is in, and only while it has no end. A closed era
     covering today cannot happen; an open one is the name they gave this
     stretch of their life, which is the one piece of context on this screen
     that is theirs rather than the app's. */
  const openEra = input.eras.find(
    (era) => era.endEpochDay === null && eraCoversDay(era, input.todayEpochDay)
  );
  if (openEra) {
    items.push({
      kind: 'era',
      eraId: openEra.id,
      name: openEra.name,
      startEpochDay: openEra.startEpochDay
    });
  }

  if (input.runningWearSession) {
    items.push({
      kind: 'wear-session',
      sessionId: input.runningWearSession.id,
      startEpochDay: epochDayFromTimestamp(input.runningWearSession.startTimestamp)
    });
  }

  /* One slot, the most recent one that passed with nothing logged against
     it, and never today's. A slot on today has not passed yet, and Home's
     own dose panel is what asks about it - offering it here would make the
     return surface ask about a dose the person still has all day to take.

     `rows` is already the schedule's own answer, pauses removed
     (doseSchedule.ts): a break somebody declared is not a slot that went
     unlogged. */
  if (input.doses.reason === null) {
    const missed = input.doses.comparison.rows
      .filter((row) => row.dose === null && row.slot.epochDay < input.todayEpochDay)
      .sort((a, b) => b.slot.epochDay - a.slot.epochDay)[0];
    if (missed) {
      const episode = input.doses.activeEpisode;
      items.push({
        kind: 'dose',
        slotEpochDay: missed.slot.epochDay,
        episodeId: episode.id,
        route: episode.route,
        dose: missed.slot.amount?.dose ?? episode.dose,
        doseUnit: missed.slot.amount?.doseUnit ?? episode.doseUnit
      });
    }
  }

  if (items.length === 0) return null;
  return { sinceEpochDay: since, items };
}
