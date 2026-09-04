/* The reads behind the return surface (phase 8 features ticket 05,
   ADR-0062).

   Split from `comingBack.ts` for the reason `liveTiles.svelte.ts` is split
   from `liveTiles.ts`: the selection is where the thresholds are and wants
   a Node test with no driver, so it takes rows. This file is what fetches
   them, in one place, so the screen and the gate that opens it read exactly
   the same thing - a screen deciding from one set of reads and a gate
   deciding from another is two surfaces disagreeing about whether the
   person came back.

   Two stages, and the order is the point. The gap is one call - eighteen
   bounded `MAX`es through `lastWrite.ts` - and almost every boot ends
   there, because almost every boot is not a return. Only a gap past the
   threshold pays for the five reads behind the items. */

import { RETURN_GAP_DAYS, lastWriteDay, whatIsWaiting, type ComingBack } from './comingBack';
import type { DosesArea } from './journal/doses';
import type { ErasArea } from './journal/eras';
import type { LastWriteArea } from './journal/lastWrite';
import type { LettersArea } from './journal/letters';
import type { MilestonesArea } from './journal/milestones';
import type { WearSessionsArea } from './journal/wearSessions';

/** The areas the return surface reads. The ones `openJournal` already
    built, so every fact arrives through the same method its own screen
    would ask (the discipline `lastWrite.ts` and `offers.ts` both keep). */
export interface ComingBackAreas {
  lastWrite: LastWriteArea;
  letters: LettersArea;
  milestones: MilestonesArea;
  eras: ErasArea;
  wearSessions: WearSessionsArea;
  doses: DosesArea;
}

/** How many letters to look at. `getLetters` is paged newest-first and the
    selection only ever shows a few of the most recently unlocked, so a
    page is enough - and a person who has written a hundred letters should
    not have all hundred read to draw three rows.

    Newest *written* is not the same order as newest *unlocked*, which is
    what the selection sorts by, so this is a bound and not the answer: a
    letter written years ago to unlock this month is inside this page as
    long as fewer than this many letters exist that were written after it. */
const LETTER_PAGE = 60;

/** What is waiting, read and decided, or null when this is not a return.

    `todayEpochDay` is an argument here too - nothing below reads a clock -
    so a caller passes the same day it drew the rest of its screen with. */
export async function readWhatIsWaiting(
  areas: ComingBackAreas,
  todayEpochDay: number
): Promise<ComingBack | null> {
  const lastWrites = await areas.lastWrite.getLastWrites(todayEpochDay);
  const since = lastWriteDay(lastWrites);
  /* The threshold twice, which looks like a duplicate of `whatIsWaiting`'s
     own check and is not: this one decides whether to spend the five reads
     below, and that one decides what the person sees. The one that matters
     is still the selection's - delete this line and the surface behaves
     identically, only slower. */
  if (since === null || todayEpochDay - since < RETURN_GAP_DAYS) return null;

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
    lastWrites,
    letters,
    milestones,
    eras,
    runningWearSession,
    doses
  });
}
