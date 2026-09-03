import { describe, expect, it } from 'vitest';
import type {
  DoseEvent,
  DosePause,
  DoseSchedule,
  HairRemovalSession,
  RegimenEpisode,
  Tryout
} from './types';
import type { JournalingPauseRange } from './journalingPause';
import {
  shouldShowActiveTryoutTile,
  shouldShowHairRemovalRecovery,
  shouldShowMeasurementsNudge,
  shouldShowPatchScheduleTile,
  shouldShowPauseActiveBanner,
  shouldShowVoiceBenchmarkNudge
} from './liveTiles.ts';

describe('liveTiles trigger predicates', () => {
  const today = 20_000;

  describe('shouldShowActiveTryoutTile', () => {
    const activeTryout: Tryout = {
      id: 'tryout-1',
      kind: 'name',
      label: 'Alicja',
      description: null,
      startEpochDay: today - 10,
      endEpochDay: null
    };

    it('suppresses tile when disabled or snoozed', () => {
      expect(
        shouldShowActiveTryoutTile({
          tryouts: [activeTryout],
          latestFeltSenseByTryoutId: new Map([[activeTryout.id, today - 4]]),
          todayEpochDay: today,
          enabled: false,
          snoozed: false
        })
      ).toBeNull();

      expect(
        shouldShowActiveTryoutTile({
          tryouts: [activeTryout],
          latestFeltSenseByTryoutId: new Map([[activeTryout.id, today - 4]]),
          todayEpochDay: today,
          enabled: true,
          snoozed: true
        })
      ).toBeNull();
    });

    it('ignores closed tryouts', () => {
      const closedTryout: Tryout = { ...activeTryout, endEpochDay: today - 1 };
      expect(
        shouldShowActiveTryoutTile({
          tryouts: [closedTryout],
          latestFeltSenseByTryoutId: new Map([[closedTryout.id, today - 5]]),
          todayEpochDay: today,
          enabled: true,
          snoozed: false
        })
      ).toBeNull();
    });

    it('triggers when active tryout has no felt-sense entry for >= 3 days', () => {
      const result = shouldShowActiveTryoutTile({
        tryouts: [activeTryout],
        latestFeltSenseByTryoutId: new Map([[activeTryout.id, today - 3]]),
        todayEpochDay: today,
        enabled: true,
        snoozed: false
      });
      expect(result).not.toBeNull();
      expect(result?.tryout.id).toBe('tryout-1');
      expect(result?.daysElapsed).toBe(3);
    });

    it('falls back to startEpochDay when no felt-sense entries exist', () => {
      const newTryout: Tryout = { ...activeTryout, startEpochDay: today - 4 };
      const result = shouldShowActiveTryoutTile({
        tryouts: [newTryout],
        latestFeltSenseByTryoutId: new Map(),
        todayEpochDay: today,
        enabled: true,
        snoozed: false
      });
      expect(result).not.toBeNull();
      expect(result?.daysElapsed).toBe(4);

      const recentTryout: Tryout = { ...activeTryout, startEpochDay: today - 2 };
      expect(
        shouldShowActiveTryoutTile({
          tryouts: [recentTryout],
          latestFeltSenseByTryoutId: new Map(),
          todayEpochDay: today,
          enabled: true,
          snoozed: false
        })
      ).toBeNull();
    });

    it('suppresses when felt-sense logged within 3 days', () => {
      expect(
        shouldShowActiveTryoutTile({
          tryouts: [activeTryout],
          latestFeltSenseByTryoutId: new Map([[activeTryout.id, today - 2]]),
          todayEpochDay: today,
          enabled: true,
          snoozed: false
        })
      ).toBeNull();
    });

    it('ignores a tryout that has not started yet, even against a stale felt-sense entry', () => {
      const futureTryout: Tryout = { ...activeTryout, startEpochDay: today + 5 };
      expect(
        shouldShowActiveTryoutTile({
          tryouts: [futureTryout],
          latestFeltSenseByTryoutId: new Map([[futureTryout.id, today - 10]]),
          todayEpochDay: today,
          enabled: true,
          snoozed: false
        })
      ).toBeNull();
    });
  });

  describe('shouldShowPatchScheduleTile', () => {
    const episode: RegimenEpisode = {
      id: 'ep-1',
      drug: 'Estradiol patch',
      ester: null,
      dose: 100,
      doseUnit: 'mcg',
      route: 'patch',
      interval: '3.5 days',
      startEpochDay: today - 14,
      endEpochDay: null
    };

    const biweeklySchedule: DoseSchedule = {
      id: 'sched-1',
      episodeId: 'ep-1',
      recurrence: { kind: 'everyNDays', everyNDays: 3 },
      dosesPerDay: 1,
      doseAmounts: null
    };

    it('suppresses when disabled, snoozed, or daily', () => {
      const dailySchedule: DoseSchedule = {
        id: 'sched-daily',
        episodeId: 'ep-1',
        recurrence: { kind: 'everyNDays', everyNDays: 1 },
        dosesPerDay: 1,
        doseAmounts: null
      };

      expect(
        shouldShowPatchScheduleTile({
          episodes: [episode],
          schedules: [dailySchedule],
          doses: [],
          pauses: [],
          todayEpochDay: today,
          enabled: true,
          snoozed: false
        })
      ).toBeNull();
    });

    it('triggers when non-daily dose is due today and unlogged', () => {
      // startEpochDay = today - 15, every 3 days -> due on today
      const epDue: RegimenEpisode = { ...episode, startEpochDay: today - 15 };
      const result = shouldShowPatchScheduleTile({
        episodes: [epDue],
        schedules: [biweeklySchedule],
        doses: [],
        pauses: [],
        todayEpochDay: today,
        enabled: true,
        snoozed: false
      });
      expect(result).not.toBeNull();
      expect(result?.episode.drug).toBe('Estradiol patch');
      expect(result?.doseAmount).toBe('100 mcg');
      expect(result?.route).toBe('patch');
    });

    it('suppresses when not due today', () => {
      // startEpochDay = today - 14, every 3 days -> due on today - 14, today - 11, today - 8, today - 5, today - 2, today + 1 (not today)
      const epNotDue: RegimenEpisode = { ...episode, startEpochDay: today - 14 };
      expect(
        shouldShowPatchScheduleTile({
          episodes: [epNotDue],
          schedules: [biweeklySchedule],
          doses: [],
          pauses: [],
          todayEpochDay: today,
          enabled: true,
          snoozed: false
        })
      ).toBeNull();
    });

    it('suppresses when dose already logged today', () => {
      const epDue: RegimenEpisode = { ...episode, startEpochDay: today - 15 };
      const loggedDose: DoseEvent = {
        id: 'dose-1',
        timestamp: today * 86_400_000 + 3600_000,
        route: 'patch',
        dose: 100,
        doseUnit: 'mcg',
        status: 'taken',
        scheduled: null,
        drug: 'Estradiol patch',
        applicationSite: 'abdomen'
      };
      expect(
        shouldShowPatchScheduleTile({
          episodes: [epDue],
          schedules: [biweeklySchedule],
          doses: [loggedDose],
          pauses: [],
          todayEpochDay: today,
          enabled: true,
          snoozed: false
        })
      ).toBeNull();
    });

    it('suppresses when paused today', () => {
      const epDue: RegimenEpisode = { ...episode, startEpochDay: today - 15 };
      const pause: DosePause = {
        id: 'pause-1',
        episodeId: 'ep-1',
        startEpochDay: today - 1,
        endEpochDay: today + 1,
        reason: 'planned'
      };
      expect(
        shouldShowPatchScheduleTile({
          episodes: [epDue],
          schedules: [biweeklySchedule],
          doses: [],
          pauses: [pause],
          todayEpochDay: today,
          enabled: true,
          snoozed: false
        })
      ).toBeNull();
    });
  });

  describe('shouldShowVoiceBenchmarkNudge', () => {
    it('stays silent until there is a benchmark to be overdue for', () => {
      const result = shouldShowVoiceBenchmarkNudge({
        benchmarks: [],
        todayEpochDay: today,
        enabled: true,
        snoozed: false
      });
      expect(result).toBeNull();
    });

    it('triggers when the last benchmark was > 14 days ago', () => {
      const benchmarks = [{ epochDay: today - 15 }];
      const result = shouldShowVoiceBenchmarkNudge({
        benchmarks,
        todayEpochDay: today,
        enabled: true,
        snoozed: false
      });
      expect(result).not.toBeNull();
      expect(result?.daysElapsed).toBe(15);
    });

    it('suppresses when the last benchmark was <= 14 days ago', () => {
      const benchmarks = [{ epochDay: today - 14 }];
      expect(
        shouldShowVoiceBenchmarkNudge({
          benchmarks,
          todayEpochDay: today,
          enabled: true,
          snoozed: false
        })
      ).toBeNull();
    });
  });

  describe('shouldShowPauseActiveBanner', () => {
    it('triggers when today is covered by active journaling pause', () => {
      const pause: JournalingPauseRange = {
        startEpochDay: today - 2,
        endEpochDay: today + 3
      };
      const result = shouldShowPauseActiveBanner({
        pauses: [pause],
        todayEpochDay: today,
        enabled: true,
        snoozed: false
      });
      expect(result).not.toBeNull();
      expect(result?.pause.startEpochDay).toBe(today - 2);
    });

    it('suppresses when no pause covers today', () => {
      const pastPause: JournalingPauseRange = {
        startEpochDay: today - 10,
        endEpochDay: today - 1
      };
      expect(
        shouldShowPauseActiveBanner({
          pauses: [pastPause],
          todayEpochDay: today,
          enabled: true,
          snoozed: false
        })
      ).toBeNull();
    });
  });

  describe('shouldShowHairRemovalRecovery', () => {
    it('triggers within 48h (today or yesterday) of session', () => {
      const session: HairRemovalSession = {
        id: 'hr-1',
        epochDay: today - 1,
        area: 'upper_lip',
        method: 'laser',
        painRating: 3,
        cost: '',
        provider: ''
      };
      const result = shouldShowHairRemovalRecovery({
        sessions: [session],
        todayEpochDay: today,
        enabled: true,
        snoozed: false
      });
      expect(result).not.toBeNull();
      expect(result?.session.area).toBe('upper_lip');
      expect(result?.daysSince).toBe(1);
    });

    it('suppresses when session is 2 or more days old (> 48h)', () => {
      const session: HairRemovalSession = {
        id: 'hr-1',
        epochDay: today - 2,
        area: 'upper_lip',
        method: 'laser',
        painRating: 3,
        cost: '',
        provider: ''
      };
      expect(
        shouldShowHairRemovalRecovery({
          sessions: [session],
          todayEpochDay: today,
          enabled: true,
          snoozed: false
        })
      ).toBeNull();
    });
  });

  describe('shouldShowMeasurementsNudge', () => {
    it('triggers when count >= 1 and gap >= 30 days', () => {
      const result = shouldShowMeasurementsNudge({
        measurementsCount: 3,
        latestMeasurementEpochDay: today - 30,
        todayEpochDay: today,
        enabled: true,
        snoozed: false
      });
      expect(result).not.toBeNull();
      expect(result?.daysSince).toBe(30);
    });

    it('suppresses when count is 0', () => {
      expect(
        shouldShowMeasurementsNudge({
          measurementsCount: 0,
          latestMeasurementEpochDay: null,
          todayEpochDay: today,
          enabled: true,
          snoozed: false
        })
      ).toBeNull();
    });

    it('suppresses when gap < 30 days', () => {
      expect(
        shouldShowMeasurementsNudge({
          measurementsCount: 2,
          latestMeasurementEpochDay: today - 29,
          todayEpochDay: today,
          enabled: true,
          snoozed: false
        })
      ).toBeNull();
    });
  });
});
