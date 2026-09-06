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
import type { Era, Letter, Milestone, WearKind, WearSession } from './types';

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
  | {
      kind: 'wear-session';
      sessionId: string;
      /** The row's own line: which day the session was started on. */
      startEpochDay: number;
      /** And the timestamp behind it, unrounded, because closing the
          session writes a duration measured from it. Carried rather than
          re-derived at the screen: a day converted back to a timestamp
          would move the start of a session the person never touched. */
      startTimestamp: number;
      /** Which practice it was (ticket 50), for the same reason the
          timestamp is carried: closing the session rewrites the whole row,
          and the sheet's own wording says which kind it is closing. */
      wearKind: WearKind;
    }
  | {
      kind: 'dose';
      slotEpochDay: number;
      episodeId: string;
      /** The episode's route in its own free-text words, unresolved.
          `matchDoseRoute` is what turns those into one of the six keys a
          dose is written with, and it needs the localised route words - so
          the sheet reads it the same way the dose log's own editor does,
          and this file stays free of paraglide. */
      episodeRoute: string;
      /** The drug in the episode's words, carried for the same reason the
          dose editor seeds it: a dose logged while one episode is active
          needs no drug of its own, and having it costs nothing when a
          second episode starts later. */
      drug: string;
      /** What the schedule was expecting in that slot, so the offer's sheet
          fills in a figure the person chose rather than one it invented -
          the slot's own amount where the schedule cycles them, and the
          episode's otherwise. */
      dose: number;
      doseUnit: string;
    };

/** One item's own identity, stable across a re-read.

    Two callers need it and neither could mint it: the screen, to remember
    which rows the person has said no to for as long as the screen is up
    (ADR-0062 - a no on a moment is not stored), and the walkthrough, whose
    handles are keys and never copy (ADR-0029). Built from the kind plus the
    row's own id, so the dose - the one kind with no row of its own yet -
    is named by the slot it is about. */
export function waitingItemKey(item: WaitingItem): string {
  switch (item.kind) {
    case 'letter':
      return `letter:${item.letterId}`;
    case 'milestone':
      return `milestone:${item.milestoneId}`;
    case 'era':
      return `era:${item.eraId}`;
    case 'wear-session':
      return `wear-session:${item.sessionId}`;
    case 'dose':
      return `dose:${item.slotEpochDay}`;
  }
}

/** Everything `whatIsWaiting` reads. Rows arrive already fetched, the way
    every `shouldShow*` predicate takes them, and each one is narrowed to
    the fields the selection actually uses. */
interface ComingBackInput {
  todayEpochDay: number;
  /** The gap being reported, from `returnGap` below - the day of the last
      write before it.

      A parameter rather than something this function works out for itself,
      and the reason is a bug it had when it did: backfilling one dose writes
      a row *inside* the gap, so the newest write moves forward, and a
      surface that recomputed the gap from the journal each time would have
      answered "no longer a return" halfway through somebody using it - the
      letter and the milestone they had not read yet vanishing off the screen
      because they logged a dose. A return is one gap, decided once, and the
      screen holds it for as long as it is up. */
  sinceEpochDay: number;
  letters: readonly Pick<Letter, 'id' | 'unlockEpochDay'>[];
  milestones: readonly Pick<Milestone, 'id' | 'name' | 'epochDay'>[];
  eras: readonly Pick<Era, 'id' | 'name' | 'startEpochDay' | 'endEpochDay'>[];
  runningWearSession: Pick<WearSession, 'id' | 'kind' | 'startTimestamp'> | null;
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

/** The registered areas whose day is a plan rather than a record, and so the
    ones the gap is not measured over.

    Every other area in the last-write registry answers "when did something
    last happen": an entry, a dose, a measurement, a wear session. These
    answer "what day is on the calendar", and the app supports putting one
    there in advance - `milestoneStatus` has a whole `countdown` arm for a
    milestone that has not happened yet, and an appointment is by definition
    something somebody books ahead of. `procedures` is here because its own
    last write is its consults, which are those appointments seen from the
    surgery journey (ADR-0066).

    Left in, they close the gap they are inside of. Somebody who wrote
    "name change hearing, 12 September" in July, stopped journalling in
    August and opened the app in late September has a last write of
    12 September as far as the registry is concerned, a gap of eight days,
    and no return surface - on the one occasion the app had something real to
    show them. Worse, the same row is what the surface would have reported.

    Found by the demo seed, which dated a milestone inside its own gap and
    made the whole screen disappear. Not a fault in `lastWrite.ts`: the
    registry answers the question it says it answers, and this is the one
    consumer for which "the newest dated record" and "the last time somebody
    wrote something" are different questions. */
export const PLANNED_AREAS = ['milestones', 'procedures', 'appointments'] as const;

/** The registry with `PLANNED_AREAS` dropped - what both the gap itself and
    its own median are measured over, since a planned day is not a moment
    somebody wrote something either way. Shared so the two callers below
    apply one rule rather than two copies of the same filter. */
function writtenAreas(
  lastWrites: Partial<Record<string, number | null>>
): Partial<Record<string, number | null>> {
  return Object.fromEntries(
    Object.entries(lastWrites).filter(([area]) => !PLANNED_AREAS.includes(area as never))
  );
}

/** How far back the median looks for a write to count (phase 8 features
    ticket 45). "Roughly the last year": long enough to see a person's own
    rhythm rather than one recent cluster, short enough that an area touched
    once, long ago, and never since does not sit in the sample forever. */
const MEDIAN_GAP_WINDOW_DAYS = 365;

/** The fewest distinct write-days the median trusts (ticket 45). Below this
    a "typical gap" is a guess dressed as a number - two data points are one
    gap, and one gap is not a rhythm. Chosen to still leave the floor as the
    only word for a journal in its first weeks, the same as before this
    ticket: `RETURN_GAP_DAYS` governs alone until there is enough history to
    say otherwise. */
const MIN_WRITE_DAYS_FOR_MEDIAN = 5;

/** The journal's own rhythm: the median gap between distinct days something
    was written, over roughly the last year - or null where there is not
    enough history to say, in which case `RETURN_GAP_DAYS` governs alone
    (ticket 45).

    Reads exactly what `returnGap` reads, no new table: the last write per
    area, the same registry (`journal/lastWrite.ts`) hands both. A full
    history of every write is not available here and does not need to be -
    each area's own last-write day already answers "when was this last
    touched", and a person whose practice spans several areas leaves one
    such day per area, spread out by how often each area is actually used.
    Collected, deduplicated (a single sitting that touches four areas is one
    write-day, not four) and sorted, the gaps between them are this journal's
    own rhythm.

    `PLANNED_AREAS` drop out here for the same reason `returnGap` drops them
    from the gap itself: a milestone dated ahead is not a moment somebody
    wrote something, so it is not a beat in this rhythm either. */
export function medianWriteGap(
  lastWrites: Partial<Record<string, number | null>>,
  todayEpochDay: number
): number | null {
  const cutoff = todayEpochDay - MEDIAN_GAP_WINDOW_DAYS;
  const recentDays = Object.values(writtenAreas(lastWrites)).filter(
    (day): day is number => day !== null && day !== undefined && day > cutoff
  );
  const days = [...new Set(recentDays)].sort((a, b) => a - b);
  if (days.length < MIN_WRITE_DAYS_FOR_MEDIAN) return null;

  const gaps = days.slice(1).map((day, index) => day - days[index]).sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 === 0 ? (gaps[mid - 1] + gaps[mid]) / 2 : gaps[mid];
}

/** How far the threshold scales past a journal's own median gap (ticket 45).

    Not 1: a gap right at the person's own median is, by definition, roughly
    as long as half their own gaps already are, so a threshold that low would
    fire on close to every other ordinary return - the exact "screen you
    learn to dismiss" outcome this ticket exists to avoid, arrived at with a
    number instead of a constant. 1.5 clears that: for a fairly regular
    rhythm, most ordinary gaps land under it, and it takes a gap the person's
    own history would call long, not merely average, to cross it.

    Checked against two shapes rather than picked in the abstract: a
    daily-ish journal's median lands under a week, so `1.5 * median` stays
    far under `RETURN_GAP_DAYS` and the floor governs, unchanged from before
    this ticket. A sparse, event-shaped journal (thirty long entries a year,
    a dose every few weeks - Persona 4, "Tomek") with an eight-week median
    gets a threshold of twelve weeks: past the three-week floor, and still
    "roughly" the person's own rhythm rather than a number unrelated to it. */
const MEDIAN_GAP_MULTIPLE = 1.5;

/** Whether coming back now is a return, and which gap it is.

    The threshold, and the only place it is applied. Null where a journal has
    never been written to and where the gap is shorter than the threshold;
    otherwise the day of the last write before the gap, which is that
    return's own identity - what `comingBackSeenSince` stores and what
    `whatIsWaiting` is then asked about.

    The threshold itself is `RETURN_GAP_DAYS` or `MEDIAN_GAP_MULTIPLE` times
    the journal's own median write gap, whichever is greater (ticket 45): the
    floor never loosens, so a journal too young to have a median behaves
    exactly as it did before this ticket, and a journal with an established,
    wider rhythm is measured against its own pace rather than everyone's. */
export function returnGap(
  lastWrites: Partial<Record<string, number | null>>,
  todayEpochDay: number
): number | null {
  const written = Object.fromEntries(
    Object.entries(lastWrites).filter(([area]) => !PLANNED_AREAS.includes(area as never))
  );
  const since = lastWriteDay(written);
  if (since === null) return null;
  const median = medianWriteGap(lastWrites, todayEpochDay);
  const threshold =
    median === null ? RETURN_GAP_DAYS : Math.max(RETURN_GAP_DAYS, MEDIAN_GAP_MULTIPLE * median);
  return todayEpochDay - since < threshold ? null : since;
}

/** What is waiting in the gap it is handed, or null if nothing is.

    Null is a real answer and the copy has one for it: a person can be away
    for three months and have the app hold nothing at all for them, and the
    honest thing then is to say so rather than to find something to show. */
export function whatIsWaiting(input: ComingBackInput): ComingBack | null {
  const since = input.sinceEpochDay;
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
      startEpochDay: epochDayFromTimestamp(input.runningWearSession.startTimestamp),
      startTimestamp: input.runningWearSession.startTimestamp,
      wearKind: input.runningWearSession.kind
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
        episodeRoute: episode.route,
        drug: episode.drug,
        dose: missed.slot.amount?.dose ?? episode.dose,
        doseUnit: missed.slot.amount?.doseUnit ?? episode.doseUnit
      });
    }
  }

  if (items.length === 0) return null;
  return { sinceEpochDay: since, items };
}
