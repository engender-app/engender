/* ADR-0043's one question, at the level a pure module can be held to: is
   cycle tracking surfaced for this journal right now. The two ways in -
   a testosterone regimen, or the explicit preference - and the default
   answer out, which is no. */

import { describe, expect, it } from 'vitest';
import { activeEpisodesAt } from './regimenEpisode';
import { cycleTrackingVisible, testosteroneActive } from './cycleTracking';
import type { RegimenEpisode } from './types';

const episode = (over: Partial<RegimenEpisode>): RegimenEpisode => ({
  id: 'ep',
  drug: 'Testosterone cypionate',
  ester: 'cypionate',
  dose: 100,
  doseUnit: 'mg',
  route: 'im',
  interval: 'weekly',
  startEpochDay: 20000,
  endEpochDay: null,
  endReason: null,
  ...over
});

/** An instant inside epoch day `day`: the day's noon, so floor() puts it
    back on the day it names no matter where the timezone sits. */
const atDay = (day: number) => day * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000;

const NOON = atDay(20000); // the fixture episode's start day

describe('testosteroneActive', () => {
  it('is true when an active episode names testosterone, in any case the drug was typed in', () => {
    expect(testosteroneActive([episode({})], NOON)).toBe(true);
    expect(testosteroneActive([episode({ drug: 'testosterone enanthate' })], NOON)).toBe(true);
    expect(testosteroneActive([episode({ drug: 'TESTOSTERONE UNDECANOATE' })], NOON)).toBe(true);
  });

  it('is false for an episode that names no testosterone, active or not', () => {
    const estradiol = episode({ drug: 'Estradiol valerate', id: 'e2' });
    expect(testosteroneActive([estradiol], NOON)).toBe(false);
    // Ended before the day in question: not active, so not asking either.
    const ended = episode({ endEpochDay: 19999 });
    expect(testosteroneActive([ended], NOON)).toBe(false);
  });

  it('is false with no episodes at all', () => {
    expect(testosteroneActive([], NOON)).toBe(false);
  });

  it('reads the same episode set activeEpisodesAt resolves, so one day past an end changes the answer', () => {
    const ending = episode({ endEpochDay: 20001 });
    expect(activeEpisodesAt([ending], atDay(20002))).toEqual([]);
    expect(testosteroneActive([ending], atDay(20002))).toBe(false);
    expect(testosteroneActive([ending], atDay(20001))).toBe(true);
  });
});

describe('cycleTrackingVisible', () => {
  it('is false by default: no testosterone, no opt-in, no cycle tracking anywhere', () => {
    expect(cycleTrackingVisible([], NOON, false)).toBe(false);
    expect(cycleTrackingVisible([episode({ drug: 'Estradiol valerate' })], NOON, false)).toBe(false);
  });

  it('is true through the preference alone, whatever the regimen says', () => {
    expect(cycleTrackingVisible([], NOON, true)).toBe(true);
    expect(cycleTrackingVisible([episode({ drug: 'Estradiol valerate' })], NOON, true)).toBe(true);
  });

  it('is true through an active testosterone episode alone, whatever the preference says', () => {
    expect(cycleTrackingVisible([episode({})], NOON, false)).toBe(true);
  });
});
