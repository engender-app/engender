import { describe, expect, it } from 'vitest';

import { CALENDAR_AXIS, availableAxes, keyingFor, plotDaySeriesGroup, type SurgeryAnchor } from './dayAxis';
import type { CompletedInterval } from '../data/dayKeying';

const TODAY = 20400;
const INTERVALS: CompletedInterval[] = [
  { startEpochDay: 20000, length: 14 },
  { startEpochDay: 20014, length: 14 }
];
const ANCHORS: SurgeryAnchor[] = [
  { id: 'proc-a', surgeryEpochDay: 20100 },
  { id: 'proc-b', surgeryEpochDay: 20300 }
];

describe('availableAxes', () => {
  it('offers the calendar axis and nothing else to an empty journal', () => {
    expect(availableAxes([], [])).toEqual([CALENDAR_AXIS]);
  });

  it('offers day of interval once the dose log has a completed interval', () => {
    expect(availableAxes(INTERVALS, [])).toEqual(['calendar', 'interval']);
  });

  it('offers one anchored axis per dated procedure, in the order given', () => {
    expect(availableAxes([], ANCHORS)).toEqual(['calendar', 'since:proc-a', 'since:proc-b']);
  });

  it('offers every axis at once to a journal that can answer them all', () => {
    expect(availableAxes(INTERVALS, ANCHORS)).toEqual([
      'calendar',
      'interval',
      'since:proc-a',
      'since:proc-b'
    ]);
  });
});

describe('keyingFor', () => {
  it('has nothing to re-key the calendar axis by', () => {
    expect(keyingFor(CALENDAR_AXIS, INTERVALS, ANCHORS, TODAY)).toBe(null);
  });

  it('keys the interval axis by the dose log intervals it was handed', () => {
    expect(keyingFor('interval', INTERVALS, ANCHORS, TODAY)).toEqual({
      type: 'repeating',
      intervals: INTERVALS
    });
  });

  it('keys an anchored axis to that procedure surgery day', () => {
    expect(keyingFor('since:proc-b', INTERVALS, ANCHORS, TODAY)).toEqual({
      type: 'anchored',
      anchorEpochDay: 20300,
      todayEpochDay: TODAY
    });
  });

  it('falls back to the calendar axis when the procedure has gone away', () => {
    expect(keyingFor('since:proc-a', INTERVALS, [ANCHORS[1]], TODAY)).toBe(null);
  });

  it('falls back to the calendar axis when the dose log no longer has an interval', () => {
    expect(keyingFor('interval', [], ANCHORS, TODAY)).toBe(null);
  });
});

describe('plotDaySeriesGroup', () => {
  const day = (d: number, value: number, count = 1) => ({ day: d, value, count });

  it('draws the calendar axis day by day over a short span', () => {
    const series = [day(20000, 4), day(20001, 2)];

    const [plot] = plotDaySeriesGroup([series], null, 30);

    expect(plot.axis).toBe('calendar');
    expect(plot.grain).toBe('day');
    expect(plot.width).toBe(1);
    expect(plot.points).toEqual([
      { x: 20000, y: 4 },
      { x: 20001, y: 2 }
    ]);
  });

  it('keys x to the position once a keying is given', () => {
    const series = [day(20100, 4), day(20114, 2)];

    const [plot] = plotDaySeriesGroup([series], { type: 'repeating', intervals: INTERVALS }, 30);

    expect(plot.axis).toBe('position');
    expect(plot.grain).toBe(null);
    // Both days are day 1 of their own interval, so they fold onto one
    // position - and below the 3-interval floor, so nothing survives.
    expect(plot.points).toEqual([]);
  });

  it('plots an anchored axis with the anchor day at zero', () => {
    const series = [day(20095, 10), day(20100, 20), day(20110, 30)];

    const [plot] = plotDaySeriesGroup(
      [series],
      { type: 'anchored', anchorEpochDay: 20100, todayEpochDay: TODAY },
      365
    );

    expect(plot.points).toEqual([
      { x: -5, y: 10 },
      { x: 0, y: 20 },
      { x: 10, y: 30 }
    ]);
  });

  it('folds every series in the group at one width', () => {
    const long = Array.from({ length: 400 }, (_, i) => day(20000 + i, 5));
    const short = [day(20000, 1), day(20001, 2)];

    const [longPlot, shortPlot] = plotDaySeriesGroup(
      [long, short],
      { type: 'anchored', anchorEpochDay: 20000, todayEpochDay: 20500 },
      365
    );

    expect(longPlot.width).toBe(shortPlot.width);
    expect(longPlot.width).toBeGreaterThan(1);
    expect(longPlot.points.length).toBeLessThanOrEqual(60);
  });
});
