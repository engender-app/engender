/* Seed the usual demo persona against an anchor five weeks ago,
   beyond the return screen's three-week threshold. Add a
   letter unlock, milestone and era inside the gap. The ordinary seeds
   would move their dates with the anchor and supply no era.

   The existing wear session stays running and the weekly injection
   schedule leaves expected slots in the gap. */

import type { Journal } from '../journal/journal';
import { todayEpochDay } from '../epochDay';
import { seedPersonaJournal } from './journal-seed';
import { seedFullFixture } from './fullFixture';
import { persona, type PersonaLocale } from './persona';

/** How far back the journal stops. */
const DEMO_GAP_DAYS = 35;

export async function seedReturnGap(
  journal: Journal,
  today: number = todayEpochDay(),
  locale: PersonaLocale = 'en'
): Promise<void> {
  const anchor = today - DEMO_GAP_DAYS;
  const say = (en: string, pl: string) => (locale === 'pl' ? pl : en);

  await seedPersonaJournal(journal, anchor, locale);
  await seedFullFixture(journal, anchor, locale);

  /* End the demo's other episodes when the journal stops, leaving only
     estradiol active through the gap. doses.getComparison returns
     multipleEpisodes for concurrent regimens. With no single schedule
     to compare, the return screen omits its dose row. */
  for (const episode of await journal.regimen.getEpisodes()) {
    if (episode.drug !== say('Estradiol valerate', 'Walerianian estradiolu')) await journal.regimen.endEpisode(episode.id, anchor);
  }

  /* The era the person is in. Open at the end on purpose: an era with no end
     is what makes it the stretch they are still in. Started the day after
     `seedPersonaJournal`'s own last era ends, rather than at a fixed offset
     from `anchor` - `persona`'s eras are dated relative to `anchor` too
     (it's seeded with `anchor` as its own "today"), and a fixed offset
     reached backward into them, tripping eras.ts's no-overlap invariant and
     leaving the whole reseed clearing itself out on the throw. */
  await journal.eras.upsertEra({
    name: say('Second year', 'Drugi rok'),
    startEpochDay: firstDayAfterPersonaEras(persona(anchor).eras),
    endEpochDay: null
  });

  /* A letter written before the gap that came due inside it, which is the
     whole point of a time capsule and the one row on the return surface
     that is unambiguously good news. */
  await journal.letters.addLetter({
    epochDay: anchor - 120,
    text: say('Whatever this month was, you got here. That was the whole ask.', 'Jakikolwiek był ten miesiąc, to już tutaj. O nic więcej nie chodziło.'),
    unlockEpochDay: anchor + 9
  });

  /* And a milestone whose day arrived while nobody looked. */
  await journal.milestones.upsertMilestone({
    name: say('Two years on HRT', 'Dwa lata na HRT'),
    epochDay: anchor + 16,
    description: ''
  });
}

/** The day after the latest of the persona's own eras ends, so an era
    started there can never overlap one of them. Exported for
    its own unit test - `seedReturnGap` as a whole needs a DOM for the
    photos `seedPersonaJournal` writes, so it can't run in the Node tier. */
export function firstDayAfterPersonaEras(personaEras: readonly { endEpochDay: number }[]): number {
  return Math.max(...personaEras.map((era) => era.endEpochDay)) + 1;
}
