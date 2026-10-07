/* One cycle visibility rule for every offer. An explicit choice wins;
   older journals without one keep the regimen rule and legacy opt-in. */

import { activeEpisodesAt } from './regimenEpisode';
import { isTestosteroneDrug } from './hormoneTestosteroneEster';
import type { RegimenEpisode } from './types';

/** Whether any episode active at `timestamp` names testosterone. The drug
    is free text a person typed, so it is read by isTestosteroneDrug, the
    rule the hormone curve already uses: the Polish "testosteron" and a
    bare "T" count, methyltestosterone does not. */
export function testosteroneActive(episodes: readonly RegimenEpisode[], timestamp: number): boolean {
  return activeEpisodesAt(episodes, timestamp).some((episode) => isTestosteroneDrug(episode.drug));
}

/** Whether app-owned entry points and prompts offer cycle tracking.
    Saved events and direct links remain available either way. */
export function cycleTrackingVisible(episodes: readonly RegimenEpisode[], timestamp: number, cycleTrackingEnabled: boolean, choice: boolean | null): boolean {
  return choice ?? (testosteroneActive(episodes, timestamp) || cycleTrackingEnabled);
}
