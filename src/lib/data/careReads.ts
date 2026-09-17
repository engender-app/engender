import { railEpisodes, scheduleDoseFacts, SPINE_FORWARD_DAYS } from './careSpine';
import { startOfDayTimestamp } from './epochDay';
import type { Journal } from './journal/journal';
import { activeEpisodesAt } from './regimenEpisode';
import { depletingStocks, drugsMatch } from './stockProjection';

export const CARE_DOSE_TOTAL_WINDOW_DAYS = 90;

/** One result for Care's medication readings. Start every journal call before
    awaiting so liveQuery observes every dependency on its first run. */
export async function readCare(
  journal: Pick<Journal, 'doses' | 'regimen' | 'stock' | 'labs' | 'exposure'>,
  today: number
) {
  const [doses, episodes, schedules, pauses, stock, latestLab, counters] = await Promise.all([
    // The last dose may precede both the rail and the totals window.
    journal.doses.getDoses(0, today),
    journal.regimen.getEpisodes(),
    journal.doses.getSchedules(),
    journal.doses.getPauses(),
    journal.stock.getProjections(today),
    journal.labs.getLatestResult(),
    journal.exposure.getCounters(today - CARE_DOSE_TOTAL_WINDOW_DAYS + 1, today)
  ]);
  const depleting = depletingStocks(stock, today, SPINE_FORWARD_DAYS);
  const lanes = railEpisodes(activeEpisodesAt(episodes, startOfDayTimestamp(today))).map((episode) => ({
    episode,
    ...scheduleDoseFacts(
      episode, episodes,
      schedules.find((schedule) => schedule.episodeId === episode.id) ?? null,
      doses, pauses.filter((pause) => pause.episodeId === episode.id), today
    ),
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
