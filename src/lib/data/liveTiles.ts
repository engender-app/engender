/* State-dependent live tile trigger predicates (phase 5 deepening ticket 03,
   ADR-0039, ADR-0036).
   
   Pure functions evaluating when Home's live tiles qualify to mount.
   Free of UI and platform dependencies so the Node tier tests them 100%. */

import type {
  DoseEvent,
  DosePause,
  DoseSchedule,
  HairRemovalSession,
  RegimenEpisode,
  Tryout
} from './types';
import type { JournalingPauseRange } from './journalingPause';
import { pauseCoversDay as isJournalingPauseOn } from './journalingPause';
import { adherence, expectedAmountOn, expectedSlots, pauseCoversDay as isDosePauseOn } from './doseSchedule';
import { activeEpisodesAt, attributeDose } from './regimenEpisode';
import { epochDayFromTimestamp, startOfDayTimestamp } from './epochDay';

export interface ActiveTryoutTileResult {
  tryout: Tryout;
  daysElapsed: number;
}

export function shouldShowActiveTryoutTile(params: {
  tryouts: readonly Tryout[];
  latestFeltSenseByTryoutId: Map<string, number | null>;
  todayEpochDay: number;
  enabled: boolean;
  snoozed: boolean;
}): ActiveTryoutTileResult | null {
  if (!params.enabled || params.snoozed) return null;

  const activeTryouts = params.tryouts.filter(
    (t) => t.endEpochDay === null || t.endEpochDay >= params.todayEpochDay
  );

  for (const tryout of activeTryouts) {
    const lastFeltDay = params.latestFeltSenseByTryoutId.get(tryout.id);
    const referenceDay = lastFeltDay != null ? lastFeltDay : tryout.startEpochDay;
    const daysElapsed = params.todayEpochDay - referenceDay;

    if (daysElapsed >= 3) {
      return { tryout, daysElapsed };
    }
  }

  return null;
}

export interface PatchScheduleTileResult {
  episode: RegimenEpisode;
  schedule: DoseSchedule;
  doseAmount: string;
  route: string;
}

export function shouldShowPatchScheduleTile(params: {
  episodes: readonly RegimenEpisode[];
  schedules: readonly DoseSchedule[];
  doses: readonly DoseEvent[];
  pauses: readonly DosePause[];
  todayEpochDay: number;
  enabled: boolean;
  snoozed: boolean;
}): PatchScheduleTileResult | null {
  if (!params.enabled || params.snoozed) return null;

  const active = activeEpisodesAt(params.episodes, startOfDayTimestamp(params.todayEpochDay));

  for (const episode of active) {
    const schedule = params.schedules.find((s) => s.episodeId === episode.id);
    if (!schedule) continue;

    const isNonDaily =
      schedule.recurrence.kind === 'everyNDays'
        ? schedule.recurrence.everyNDays > 1
        : schedule.recurrence.weekdays.length < 7;

    if (!isNonDaily) continue;

    const slotsToday = expectedSlots(
      schedule,
      episode.startEpochDay,
      params.todayEpochDay,
      params.todayEpochDay
    );
    if (slotsToday.length === 0) continue;

    const isPaused = params.pauses.some(
      (p) => p.episodeId === episode.id && isDosePauseOn(p, params.todayEpochDay)
    );
    if (isPaused) continue;

    const episodeDoses = params.doses.filter(
      (d) =>
        epochDayFromTimestamp(d.timestamp) === params.todayEpochDay &&
        attributeDose(params.episodes, d).episode?.id === episode.id
    );

    const adh = adherence(slotsToday, episodeDoses, params.pauses);
    const unloggedSlot = adh.rows.find((r) => r.slot.epochDay === params.todayEpochDay && r.dose === null);

    if (unloggedSlot) {
      const expAmount = expectedAmountOn(adh, params.todayEpochDay);
      const doseAmount = expAmount
        ? `${expAmount.dose} ${expAmount.doseUnit}`
        : `${episode.dose} ${episode.doseUnit}`;

      return {
        episode,
        schedule,
        doseAmount,
        route: episode.route
      };
    }
  }

  return null;
}

export interface VoiceBenchmarkNudgeResult {
  daysElapsed: number | null;
}

/* Benchmarks, not an entry's voice memos (phase 5 deepening ticket 15). The
   tile was written against `voice.inJournal()` while voice_benchmark did not
   exist yet, which made it measure the age of the last memo somebody attached
   to an entry - a different record with a different cadence, and the one
   thing a benchmark reminder must not be counting. The empty case still
   nudges, because "no baseline recorded yet" is what the tile's own copy
   says and is the only route to the flow before the first one exists. */
export function shouldShowVoiceBenchmarkNudge(params: {
  benchmarks: readonly { epochDay: number }[];
  todayEpochDay: number;
  enabled: boolean;
  snoozed: boolean;
}): VoiceBenchmarkNudgeResult | null {
  if (!params.enabled || params.snoozed) return null;

  if (params.benchmarks.length === 0) {
    return { daysElapsed: null };
  }

  let latestDay = params.benchmarks[0].epochDay;
  for (const benchmark of params.benchmarks) {
    if (benchmark.epochDay > latestDay) latestDay = benchmark.epochDay;
  }

  const daysElapsed = params.todayEpochDay - latestDay;
  if (daysElapsed > 14) {
    return { daysElapsed };
  }

  return null;
}

export interface PauseActiveBannerResult {
  pause: JournalingPauseRange;
  resumeEpochDay: number | null;
}

export function shouldShowPauseActiveBanner(params: {
  pauses: readonly JournalingPauseRange[];
  todayEpochDay: number;
  enabled: boolean;
  snoozed: boolean;
}): PauseActiveBannerResult | null {
  if (!params.enabled || params.snoozed) return null;

  const activePause = params.pauses.find((p) => isJournalingPauseOn(p, params.todayEpochDay));
  if (!activePause) return null;

  return {
    pause: activePause,
    resumeEpochDay: activePause.endEpochDay != null ? activePause.endEpochDay + 1 : null
  };
}

export interface HairRemovalRecoveryResult {
  session: HairRemovalSession;
  daysSince: number;
}

export function shouldShowHairRemovalRecovery(params: {
  sessions: readonly HairRemovalSession[];
  todayEpochDay: number;
  enabled: boolean;
  snoozed: boolean;
}): HairRemovalRecoveryResult | null {
  if (!params.enabled || params.snoozed) return null;
  if (params.sessions.length === 0) return null;

  let latestSession = params.sessions[0];
  for (const s of params.sessions) {
    if (s.epochDay > latestSession.epochDay) latestSession = s;
  }

  const daysSince = params.todayEpochDay - latestSession.epochDay;
  // 48 hours following session = today (0) or yesterday (1)
  if (daysSince >= 0 && daysSince < 2) {
    return { session: latestSession, daysSince };
  }

  return null;
}

export interface MeasurementsNudgeResult {
  daysSince: number;
}

export function shouldShowMeasurementsNudge(params: {
  measurementsCount: number;
  latestMeasurementEpochDay: number | null;
  todayEpochDay: number;
  enabled: boolean;
  snoozed: boolean;
}): MeasurementsNudgeResult | null {
  if (!params.enabled || params.snoozed) return null;
  if (params.measurementsCount < 1 || params.latestMeasurementEpochDay == null) return null;

  const daysSince = params.todayEpochDay - params.latestMeasurementEpochDay;
  if (daysSince >= 30) {
    return { daysSince };
  }

  return null;
}
