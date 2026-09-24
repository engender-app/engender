import { railEpisodes, scheduleDoseFacts, SPINE_FORWARD_DAYS } from './careSpine';
import { startOfDayTimestamp } from './epochDay';
import type { Journal } from './journal/journal';
import { activeEpisodesAt } from './regimenEpisode';
import { depletingStocks, drugsMatch } from './stockProjection';
import type { DoseEvent } from './types';

export const CARE_DOSE_TOTAL_WINDOW_DAYS = 90;

/** One result for Care's medication readings. Start every journal call before
    awaiting so liveQuery observes every dependency on its first run. */
export async function readCare(
  journal: Pick<Journal, 'doses' | 'regimen' | 'stock' | 'labs' | 'exposure'>,
  today: number
) {
  const [recentDoses, episodes, schedules, pauses, stock, latestLab, counters] = await Promise.all([
    /* The totals window's doses, not the whole log (ux-carpet ticket 221).
       Every lane asks for two things of the log: its last logged dose and
       any dose logged from today. Both sit in the last few weeks on any
       journal kept up, and the whole log was 593 KB of the 611 KB this read
       moved across the Android bridge on the decade fixture. A lane whose
       last dose is older than the window reads the rest below. */
    journal.doses.getDoses(today - CARE_DOSE_TOTAL_WINDOW_DAYS + 1, today),
    journal.regimen.getEpisodes(),
    journal.doses.getSchedules(),
    journal.doses.getPauses(),
    journal.stock.getProjections(today),
    journal.labs.getLatestResult(),
    journal.exposure.getCounters(today - CARE_DOSE_TOTAL_WINDOW_DAYS + 1, today)
  ]);
  const depleting = depletingStocks(stock, today, SPINE_FORWARD_DAYS);
  const running = railEpisodes(activeEpisodesAt(episodes, startOfDayTimestamp(today)));
  const factsOver = (doses: readonly DoseEvent[]) =>
    running.map((episode) =>
      scheduleDoseFacts(
        episode, episodes,
        schedules.find((schedule) => schedule.episodeId === episode.id) ?? null,
        doses, pauses.filter((pause) => pause.episodeId === episode.id), today
      )
    );
  let facts = factsOver(recentDoses);
  /* The last dose may precede the window: a drug not logged in 90 days, or
     a journal picked back up. Only then is the older log read, and the facts
     recomputed over all of it, so the answer is the one the whole log gives.
     The dose table is already one this read observes, through the read
     above, so liveQuery's dependencies do not change with the branch.
     A lane with nothing ever logged - a regimen started today - also takes
     this branch, on every mount until its first dose, and pays what every
     mount paid before this change; a narrower per-drug read would need
     attribution in SQL for doses naming no drug, which is not worth it for
     a state that lasts until the first dose is logged. */
  if (facts.some((fact) => fact.lastDoseEpochDay === null)) {
    const older = await journal.doses.getDoses(0, today - CARE_DOSE_TOTAL_WINDOW_DAYS);
    facts = factsOver([...older, ...recentDoses]);
  }
  const lanes = running.map((episode, i) => ({
    episode,
    ...facts[i],
    runOut: depleting.find((row) => drugsMatch(row.entry.drug, episode.drug)) ?? null,
    doseTotals: counters.doseTotals.filter((total) => total.drug === episode.drug)
  }));
  return {
    lanes,
    latestLab,
    stock,
    stockExcludedDoses: stock.reduce((total, row) => total + row.projection.excludedDoses, 0)
  };
}
