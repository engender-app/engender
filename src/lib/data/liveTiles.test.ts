import { describe, expect, it } from 'vitest';
import type {
  DoseEvent,
  DosePause,
  DoseSchedule,
  JournalingPause,
  RegimenEpisode
} from './types';
import {
  shouldShowMeasurementsNudge,
  shouldShowPatchScheduleTile,
  shouldShowPauseActiveBanner
} from './liveTiles.ts';

describe('liveTiles trigger predicates', () => {
  const today = 20_000;

  describe('shouldShowPatchScheduleTile', () => {
    const episode: RegimenEpisode = {
      id: 'ep-1',
      drug: 'Estradiol patch',
      drugClass: 'hrt',
      ester: null,
      dose: 100,
      doseUnit: 'mcg',
      route: 'patch',
      interval: '3.5 days',
      startEpochDay: today - 14,
      endEpochDay: null,
      endReason: null
    };

    const biweeklySchedule: DoseSchedule = {
      id: 'sched-1',
      episodeId: 'ep-1',
      recurrence: { kind: 'everyNDays', everyNDays: 3 },
      dosesPerDay: 1,
      doseAmounts: null,
      autoLogFromEpochDay: null
    };

    it('suppresses when disabled, snoozed, or daily', () => {
      const dailySchedule: DoseSchedule = {
        id: 'sched-daily',
        episodeId: 'ep-1',
        recurrence: { kind: 'everyNDays', everyNDays: 1 },
        dosesPerDay: 1,
        doseAmounts: null,
        autoLogFromEpochDay: null
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
        source: 'person',
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

  describe('shouldShowPauseActiveBanner', () => {
    it('triggers when today is covered by active journaling pause', () => {
      const pause: JournalingPause = {
        id: 'pause-1',
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
      const pastPause: JournalingPause = {
        id: 'pause-2',
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
