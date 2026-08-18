/* The clinician visit summary (phase 4 ticket 12, CONTEXT: "Regimen
   episode", "Dose event", "Analyte", "Side effect"). A view over rows
   regimen, doses, labs, exposure and sideEffects own, not a sixth owner for
   any of them - the whole point of this area is that it introduces no
   figure the tickets it draws from do not already produce (ADR-0010).
   Selecting which rows fall in the requested range is the only work done
   here; nothing is aggregated, interpreted or stored. */

import { episodeEndEpochDay } from '../regimenEpisode';
import type { DoseEvent, LabResult, RegimenEpisode, SideEffect } from '../types';
import type { DosesArea } from './doses';
import type { ExposureArea, ExposureCounters } from './exposure';
import type { LabsArea } from './labs';
import type { RegimenArea } from './regimen';
import type { SideEffectsArea } from './sideEffects';

/** A regimen episode plus its derived end day (regimenEpisode.ts), computed
    against the full episode history before the range filter runs - so a
    superseded episode still in range reports the day it ended rather than
    reading as ongoing just because the episode that superseded it fell
    outside the window. */
export interface ClinicianSummaryEpisode extends RegimenEpisode {
  endEpochDay: number | null;
}

export interface ClinicianSummary {
  regimenEpisodes: ClinicianSummaryEpisode[];
  doses: DoseEvent[];
  labResults: LabResult[];
  exposure: ExposureCounters;
  sideEffects: SideEffect[];
}

export interface ClinicianSummaryArea {
  /** Everything tickets 01, 02, 03, 05 and 06 already read, scoped to
      `[fromEpochDay, toEpochDay]` and assembled for printing - nothing here
      is stored (phase 4 ticket 12). */
  getSummary(fromEpochDay: number, toEpochDay: number): Promise<ClinicianSummary>;
}

export function makeClinicianSummaryArea(
  regimen: RegimenArea,
  doses: DosesArea,
  labs: LabsArea,
  exposure: ExposureArea,
  sideEffects: SideEffectsArea
): ClinicianSummaryArea {
  return {
    async getSummary(fromEpochDay, toEpochDay) {
      const [episodes, doseEvents, analytes, counters, effects] = await Promise.all([
        regimen.getEpisodes(),
        doses.getDoses(fromEpochDay, toEpochDay),
        labs.getUsedAnalytes(),
        exposure.getCounters(fromEpochDay, toEpochDay),
        sideEffects.getSideEffectsInRange(fromEpochDay, toEpochDay)
      ]);

      /* episodes is regimen.getEpisodes()'s own order - ascending by
         startEpochDay - which episodeEndEpochDay requires (regimenEpisode.ts).
         Each episode's end is derived against that full, correctly-ordered
         history first, so a superseded episode still in range keeps the end
         day its successor gives it even though that successor itself may
         fall outside the window. An episode belongs in the history if any
         part of its dated range overlaps the window - the same overlap
         exposureCounters.ts's own overlapDays tests, kept here as a filter
         rather than a count. */
      const regimenEpisodes = episodes
        .map((episode, index) => ({ ...episode, endEpochDay: episodeEndEpochDay(episodes, index) }))
        .filter((episode) => episode.startEpochDay <= toEpochDay && (episode.endEpochDay === null || episode.endEpochDay >= fromEpochDay));

      /* labs.ts has no cross-analyte range read (unlike doses and side
         effects), so every used analyte's results are read and the range
         filter applied here - selecting rows, not computing a new figure. */
      const resultsByAnalyte = await Promise.all(analytes.map((a) => labs.getResults(a)));
      const labResults = resultsByAnalyte
        .flat()
        .filter((result) => result.epochDay >= fromEpochDay && result.epochDay <= toEpochDay)
        .sort((a, b) => a.epochDay - b.epochDay);

      return { regimenEpisodes, doses: doseEvents, labResults, exposure: counters, sideEffects: effects };
    }
  };
}
