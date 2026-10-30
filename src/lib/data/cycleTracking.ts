/* One cycle visibility rule for every offer. An explicit choice wins;
   older journals without one keep the regimen rule. */

import { activeEpisodesAt } from './regimenEpisode';
import { resolveHormoneDrug } from './hormoneDrug';
import type { RegimenEpisode } from './types';

/** Whether any episode active at `timestamp` names testosterone. The drug
    is free text a person typed. The Polish "testosteron" and a bare "T"
    count; methyltestosterone does not. */
export function testosteroneActive(episodes: readonly RegimenEpisode[], timestamp: number): boolean {
  return activeEpisodesAt(episodes, timestamp).some((episode) => resolveHormoneDrug(episode.drug) === 'testosterone');
}

/** Whether app-owned entry points and prompts offer cycle tracking.
    Saved events and direct links remain available either way. */
export function cycleTrackingVisible(episodes: readonly RegimenEpisode[], timestamp: number, choice: boolean | null): boolean {
  return choice ?? testosteroneActive(episodes, timestamp);
}
