/* Whether cycle tracking is surfaced at all (ADR-0043): a pure question
   over the episodes and the preference, kept above the journal seam the
   way regimenEpisode.ts is, so every surface that asks it asks the same
   one. The default answer is no - a standalone cycle row is a dysphoria
   trigger for someone who will never have a cycle, so it earns its place
   either through an active testosterone regimen (the drug names it) or
   through the explicit opt-in, and never any other way. */

import { activeEpisodesAt } from './regimenEpisode';
import type { RegimenEpisode } from './types';

/** Whether any episode active at `timestamp` names testosterone. The drug
    is free text a person typed, so this matches a substring, case
    ignored - the same loose read the ticket's own rule spells out. */
export function testosteroneActive(episodes: readonly RegimenEpisode[], timestamp: number): boolean {
  return activeEpisodesAt(episodes, timestamp).some((episode) => episode.drug.toLowerCase().includes('testosterone'));
}

/** The one visibility rule every cycle-tracking surface reads: an active
    testosterone regimen surfaces it on its own, and the preference opts
    in everyone else. Nothing here hides data - the log keeps its records
    and its direct URL either way (ADR-0043); this only decides whether
    navigation names it. */
export function cycleTrackingVisible(episodes: readonly RegimenEpisode[], timestamp: number, cycleTrackingEnabled: boolean): boolean {
  return testosteroneActive(episodes, timestamp) || cycleTrackingEnabled;
}
