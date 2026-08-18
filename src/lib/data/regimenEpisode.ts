/* Regimen episode resolution (CONTEXT: "Regimen episode", ADR-0010): a
   pure question over a list of episodes and a timestamp, kept above the
   journal seam the same way milestoneStatus.ts is - nothing here reads a
   clock or a database, so downstream tickets (02 onward) call it against
   whatever episodes journal.regimen.getEpisodes() already returned, rather
   than each re-deriving "which episode was this logged under".

   An episode's end is never stored (ADR-0010): it is the day before the
   next episode's start, or "ongoing" for the latest one, which is what
   lets a retroactive correction (a new episode inserted with a past start
   date) change every affected record's attribution just by changing which
   episode sorts where - no migration, no stored link to rewrite. */

import { epochDayFromTimestamp } from './epochDay';
import type { RegimenEpisode } from './types';

/** Which episode was in effect at `timestamp`: the latest one whose start
    day is on or before the epoch day `timestamp` falls on. `episodes` must
    be sorted ascending by `startEpochDay` (ties broken by insertion order),
    which is the order journal.regimen.getEpisodes() already returns them
    in - the last qualifying entry in that order is the answer, so no
    comparison of ids or "now" is needed. Hidden episodes still resolve:
    hiding takes an episode out of pickers, not out of history, and a
    record logged under one keeps resolving to it. */
export function resolveEpisodeAt(
  episodes: readonly RegimenEpisode[],
  timestamp: number
): RegimenEpisode | null {
  const day = epochDayFromTimestamp(timestamp);
  let resolved: RegimenEpisode | null = null;
  for (const episode of episodes) {
    if (episode.startEpochDay > day) break;
    resolved = episode;
  }
  return resolved;
}

/** The day before the episode at `index`'s successor starts, or null if it
    is the latest (still ongoing). `episodes` must be in the same sorted
    order resolveEpisodeAt expects. */
export function episodeEndEpochDay(episodes: readonly RegimenEpisode[], index: number): number | null {
  const next = episodes[index + 1];
  return next ? next.startEpochDay - 1 : null;
}

/** The start day of HRT overall - the first episode there has ever been -
    not of whichever episode is active right now. Ticket 07's personal
    effects timeline anchors against this and nothing else, so it does not
    shift when a second, different episode starts later. `episodes` must be
    in the same sorted order resolveEpisodeAt expects; hidden episodes
    still count, the same as they still resolve. Null when there is no
    episode at all yet. */
export function earliestEpisodeStartEpochDay(episodes: readonly RegimenEpisode[]): number | null {
  return episodes[0]?.startEpochDay ?? null;
}
