/* The demo journal five weeks after the person stopped writing in it
   (phase 8 features ticket 05, ADR-0062).

   The return surface is the one screen in the app whose whole condition is
   that nothing has been written for three weeks, so neither of the other
   two seeds can show it: both stop on today, and a journal that stops on
   today is not a return. PRODUCT.md's line is that demo data renders every
   screen, and this is what that costs here.

   Nothing new is invented for it. It is the persona plus every other area,
   seeded against an anchor day five weeks back so the whole journal stops
   there, and then three rows dated inside the gap - the arrivals the app
   made while nobody was looking. Those three are the ones neither existing
   seed could produce by being shifted: a letter unlocks and a milestone
   lands on days their own seeds place relative to the anchor, so shifting
   the anchor moves them out of the gap along with everything else, and
   neither seed writes an era at all.

   Five weeks rather than the three the threshold asks for, because three
   weeks exactly is the boundary case and a review build should show the
   ordinary one. The other three kinds of row need no help: the running wear
   session the full fixture leaves behind is still running, and the persona's
   weekly injections leave slots the schedule expected inside the gap. */

import type { Journal } from '../journal/journal';
import { todayEpochDay } from '../epochDay';
import { seedPersonaJournal } from './journal-seed';
import { seedFullFixture } from './fullFixture';

/** How far back the journal stops. */
export const DEMO_GAP_DAYS = 35;

export async function seedReturnGap(journal: Journal, today: number = todayEpochDay()): Promise<void> {
  const anchor = today - DEMO_GAP_DAYS;

  await seedPersonaJournal(journal, anchor);
  await seedFullFixture(journal, anchor);

  /* The era the person is in. Open at both ends on purpose: an era with no
     end is what makes it the stretch they are still in, and no start is the
     ordinary shape of the first era somebody names (eras.ts). */
  await journal.eras.upsertEra({ name: 'Second year', startEpochDay: anchor - 300, endEpochDay: null });

  /* A letter written before the gap that came due inside it, which is the
     whole point of a time capsule and the one row on the return surface
     that is unambiguously good news. */
  await journal.letters.addLetter({
    epochDay: anchor - 120,
    text: 'Whatever this month was, you got here. That was the whole ask.',
    unlockEpochDay: anchor + 9
  });

  /* And a milestone whose day arrived while nobody looked. */
  await journal.milestones.upsertMilestone({
    name: 'Two years on HRT',
    epochDay: anchor + 16,
    description: ''
  });
}
