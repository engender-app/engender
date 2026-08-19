/* Cumulative exposure counters (phase 4 ticket 05, CONTEXT: "Regimen
   episode", "Dose event"). Pure, kept above the journal seam beside
   regimenEpisode.ts and stockProjection.ts: nothing here reads a clock or
   a database, and no counter is stored - every one is recomputed from the
   dose log and the regimen episode history for whatever range is asked
   for (ADR-0010), the same way stockProjection.ts's own figures are.

   Every counter is a plain count. No target range, no threshold, no
   comparison to a "typical" value - the caller decides how to show a
   number, this module only ever produces one.

   A dose usually names no drug of its own (CONTEXT: "Dose event"); its
   drug is resolved against the episode history the same way
   stockProjection.ts's consumesStock does (regimenEpisode.ts's
   attributeDrug). A dose with no episode to resolve against - logged
   before any episode existed - has no drug to report a total against, so
   it is left out rather than guessed at, silently as it always was. A
   dose left ambiguous by two concurrent episodes for different drugs
   (phase 5 ticket 38) is also left out, but counted (DoseTotals'
   excludedDoses), so a total is never silently short.

   Grouped by drug and route together, never combined across a route
   boundary: a route-conversion table to compare across routes was cut at
   the phase 4 grilling session (candidate item 24) and this module does
   not re-derive one, so a switch from oral to injectable estradiol reports
   as two totals, not one converted total.

   Days-on-route and time-on-regimen read only the episode history, not
   the dose log: a regimen episode is "in effect" for every calendar day
   of its dated range (CONTEXT: "Regimen episode"), whether or not a dose
   happened to be logged - or paused (CONTEXT: "Dose pause") - on a given
   day within it, the same way stockProjection.ts treats a pause as still
   running rather than as having ended the regimen. */

import { epochDayFromTimestamp } from './epochDay';
import { attributeDrug } from './regimenEpisode';
import type { DoseEvent, DoseRoute, RegimenEpisode } from './types';

export interface DoseTotal {
  drug: string;
  route: DoseRoute;
  doseUnit: string;
  /** Every non-skipped dose's amount, summed in its own native unit
      (ADR-0012) - a skipped dose used nothing, so it contributes nothing. */
  total: number;
}

export interface DoseTotals {
  totals: DoseTotal[];
  /** Doses left out because more than one concurrent regimen episode was
      active and the dose named no drug of its own to break the tie (phase
      5 ticket 38), or named one matching no active episode - counted so a
      total is never silently short. A dose with nothing to resolve against
      at all (no episode ever covers it) is not counted here: that is the
      pre-existing, unambiguous "nothing to attribute" case. */
  excludedDoses: number;
}

export interface RouteDays {
  route: string;
  days: number;
}

export interface RegimenDays {
  episodeId: string;
  drug: string;
  ester: string | null;
  dose: number;
  doseUnit: string;
  route: string;
  days: number;
}

const groupKey = (drug: string, route: string, doseUnit: string): string => `${drug} ${route} ${doseUnit}`;

/** Cumulative dose totals per drug/route/unit, integrated over every
    non-skipped dose whose own epoch day falls in `[fromEpochDay,
    toEpochDay]`. `doses` and `episodes` need not already be scoped to the
    range or to each other - this resolves each dose's drug itself, the way
    stockProjection.ts's callers hand it a wider window than any one
    figure needs. */
export function cumulativeDoseTotals(
  doses: readonly DoseEvent[],
  episodes: readonly RegimenEpisode[],
  fromEpochDay: number,
  toEpochDay: number
): DoseTotals {
  const totals = new Map<string, DoseTotal>();
  let excludedDoses = 0;

  for (const dose of doses) {
    if (dose.status === 'skipped') continue;
    const day = epochDayFromTimestamp(dose.timestamp);
    if (day < fromEpochDay || day > toEpochDay) continue;

    const { drug, ambiguous } = attributeDrug(episodes, dose);
    if (drug === null) {
      if (ambiguous) excludedDoses += 1;
      continue;
    }

    const trimmedDrug = drug.trim();
    const key = groupKey(trimmedDrug, dose.route, dose.doseUnit);
    const existing = totals.get(key);
    if (existing) existing.total += dose.dose;
    else totals.set(key, { drug: trimmedDrug, route: dose.route, doseUnit: dose.doseUnit, total: dose.dose });
  }

  const sorted = [...totals.values()].sort(
    (a, b) => a.drug.localeCompare(b.drug) || a.route.localeCompare(b.route) || a.doseUnit.localeCompare(b.doseUnit)
  );
  return { totals: sorted, excludedDoses };
}

/** How many days of `[fromEpochDay, toEpochDay]` one episode overlaps,
    given its own stored end day, or null while it is still ongoing - in
    which case it runs through `toEpochDay`. Zero when the episode starts
    after the range ends or ended before the range starts. */
function overlapDays(episode: RegimenEpisode, fromEpochDay: number, toEpochDay: number): number {
  const start = Math.max(episode.startEpochDay, fromEpochDay);
  const end = Math.min(episode.endEpochDay ?? toEpochDay, toEpochDay);
  return Math.max(0, end - start + 1);
}

/** Every episode's own time on it within `[fromEpochDay, toEpochDay]` -
    "regimen" always means one specific dated episode (CONTEXT: "Regimen
    episode"), never a recurring plan, so this is per episode and not
    grouped by drug or dose. Hidden episodes still count: hiding takes an
    episode out of a picker, not out of history (CONTEXT: "Hidden"). */
export function timeOnEachRegimen(
  episodes: readonly RegimenEpisode[],
  fromEpochDay: number,
  toEpochDay: number
): RegimenDays[] {
  return episodes
    .map((episode) => ({
      episodeId: episode.id,
      drug: episode.drug,
      ester: episode.ester,
      dose: episode.dose,
      doseUnit: episode.doseUnit,
      route: episode.route,
      days: overlapDays(episode, fromEpochDay, toEpochDay)
    }))
    .filter((row) => row.days > 0);
}

/** Days on each route within `[fromEpochDay, toEpochDay]`, summed across
    every episode that used it - a dose change that keeps the same route
    (e.g. a dose increase, still oral) adds to the same total rather than
    starting a new one. */
export function daysOnEachRoute(episodes: readonly RegimenEpisode[], fromEpochDay: number, toEpochDay: number): RouteDays[] {
  const totals = new Map<string, number>();

  episodes.forEach((episode) => {
    const days = overlapDays(episode, fromEpochDay, toEpochDay);
    if (days <= 0) return;
    totals.set(episode.route, (totals.get(episode.route) ?? 0) + days);
  });

  return [...totals.entries()].map(([route, days]) => ({ route, days })).sort((a, b) => a.route.localeCompare(b.route));
}
