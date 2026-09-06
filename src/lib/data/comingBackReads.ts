/* The reads behind the return surface (phase 8 features ticket 05,
   ADR-0062).

   Split from `comingBack.ts` for the reason `liveTiles.svelte.ts` is split
   from `liveTiles.ts`: the selection is where the thresholds are and wants
   a Node test with no driver, so it takes rows. This file is what fetches
   them, in one place, so the screen and the gate that opens it read exactly
   the same thing - a screen deciding from one set of reads and a gate
   deciding from another is two surfaces disagreeing about whether the
   person came back.

   Two calls, and they are separate on purpose rather than for tidiness.
   `readReturnGap` is one query - eighteen bounded `MAX`es through
   `lastWrite.ts` - and almost every boot ends there, because almost every
   boot is not a return. `readWhatIsWaiting` then costs five reads and is
   asked *about a gap it is handed*, so the caller decides which gap it is
   asking about and can go on asking about the same one.

   The screen depends on that. Backfilling a dose writes a row inside the
   gap, so a screen that re-derived the gap on every write would have
   answered "not a return any more" while somebody was still using it. It
   reads the gap once and the items as often as the journal changes. */

import { returnGap, whatIsWaiting, type ComingBack } from './comingBack';
import type { DosesArea } from './journal/doses';
import type { ErasArea } from './journal/eras';
import type { LastWriteArea } from './journal/lastWrite';
import type { LettersArea } from './journal/letters';
import type { MilestonesArea } from './journal/milestones';
import type { WearSessionsArea } from './journal/wearSessions';
import { tablesReadBy, type TableName } from './live/writes';

/** The areas the return surface reads. The ones `openJournal` already
    built, so every fact arrives through the same method its own screen
    would ask (the discipline `lastWrite.ts` and `offers.ts` both keep). */
/* ComingBackAreas stays exported only for its own test (AU-09 test-only
   review). */
export interface ComingBackAreas {
  lastWrite: LastWriteArea;
  letters: LettersArea;
  milestones: MilestonesArea;
  eras: ErasArea;
  wearSessions: WearSessionsArea;
  doses: DosesArea;
}

/** The tables `readWhatIsWaiting` reads, for the live query that watches it
    (`/coming-back`'s `waitingQuery`, phase 8 audit ticket 14). Its own five
    calls are all made after the gap's own `await`, so a live query would
    otherwise discover every one of them a re-run late; seeding with this
    list is what a call site is never allowed to hand-write itself
    (`liveQuery`'s own doc, and the risk `liveQueryWatchingOnly` warns about).

    Built from `tablesReadBy` rather than copied by hand: a table added to
    one of these five reads in writes.ts reaches this list, and so the seed,
    without a second edit here. */
export const WAITING_TABLES: TableName[] = [
  ...new Set([
    ...tablesReadBy('letters', 'getLetters'),
    ...tablesReadBy('milestones', 'getMilestones'),
    ...tablesReadBy('eras', 'getEras'),
    ...tablesReadBy('wearSessions', 'getRunningSession'),
    ...tablesReadBy('doses', 'getComparison')
  ])
];

/** How many letters to look at. `getLetters` is paged newest-first and the
    selection only ever shows a few of the most recently unlocked, so a
    page is enough - and a person who has written a hundred letters should
    not have all hundred read to draw three rows.

    Newest *written* is not the same order as newest *unlocked*, which is
    what the selection sorts by, so this is a bound and not the answer: a
    letter written years ago to unlock this month is inside this page as
    long as fewer than this many letters exist that were written after it. */
const LETTER_PAGE = 60;

/** Whether this is a return, and which gap - the day of the last write
    before it, or null.

    `todayEpochDay` is an argument here too, as it is everywhere in this
    feature: nothing reads a clock, so a caller passes the same day it drew
    the rest of its screen with. */
export async function readReturnGap(
  areas: Pick<ComingBackAreas, 'lastWrite'>,
  todayEpochDay: number
): Promise<number | null> {
  return returnGap(await areas.lastWrite.getLastWrites(todayEpochDay), todayEpochDay);
}

/** What is waiting in `sinceEpochDay`'s gap, or null when nothing is. */
export async function readWhatIsWaiting(
  areas: ComingBackAreas,
  todayEpochDay: number,
  sinceEpochDay: number
): Promise<ComingBack | null> {
  const since = sinceEpochDay;
  const [letters, milestones, eras, runningWearSession, doses] = await Promise.all([
    areas.letters.getLetters(LETTER_PAGE),
    areas.milestones.getMilestones(),
    areas.eras.getEras(),
    areas.wearSessions.getRunningSession(),
    /* The gap window, ending yesterday: today's own slot is today's
       business (comingBack.ts). `getComparison` is what resolves the
       episode in effect, its schedule and its pauses, so this file asks one
       question instead of assembling four. */
    areas.doses.getComparison({ fromEpochDay: since + 1, toEpochDay: todayEpochDay - 1 })
  ]);

  return whatIsWaiting({
    todayEpochDay,
    sinceEpochDay: since,
    letters,
    milestones,
    eras,
    runningWearSession,
    doses
  });
}
