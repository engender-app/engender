import { describe, expect, test } from 'vitest';
import { AXIS_MIN_SPAN_DAYS, MARK_MIN_GAP, noticedAxis, type NoticedChange } from './noticedAxis';

/* Days are epoch days and the numbers here are small on purpose: an axis is
   arithmetic over differences, so 0 stands in for the day a regimen began as
   well as any other day would, and a test that has to be read next to a
   calendar is a test nobody reads. The two places a real date matters - which
   month a tick lands in, and counting months from a day rather than from the
   first of one - use dates written out. */

const change = (key: string, firstNoticedEpochDay: number, extra: Partial<NoticedChange> = {}): NoticedChange => ({
  key,
  label: key,
  direction: 'feminizing',
  firstNoticedEpochDay,
  ...extra
});

describe('which axis it is', () => {
  test('a regimen start makes the axis months since onset, beginning at the start', () => {
    const axis = noticedAxis([change('a', 100)], 0, 400);
    expect(axis.mode).toBe('onset');
    expect(axis.fromEpochDay).toBe(0);
    expect(axis.toEpochDay).toBe(400);
  });

  test('no regimen start falls back to calendar time, beginning at the first thing noticed', () => {
    const axis = noticedAxis([change('a', 100), change('b', 250)], null, 400);
    expect(axis.mode).toBe('calendar');
    expect(axis.fromEpochDay).toBe(100);
  });

  test('nothing noticed and no start: an empty line ending today', () => {
    const axis = noticedAxis([], null, 400);
    expect(axis.marks).toEqual([]);
    expect(axis.lanes).toBe(0);
    expect(axis.toEpochDay).toBe(400);
    expect(axis.toEpochDay - axis.fromEpochDay).toBe(AXIS_MIN_SPAN_DAYS);
  });

  test('a change noticed before the regimen began pulls the left end back to it', () => {
    const axis = noticedAxis([change('a', -40)], 0, 400);
    expect(axis.mode).toBe('onset');
    expect(axis.fromEpochDay).toBe(-40);
  });

  test('the right end is the later of today and the last thing noticed, and never past it', () => {
    expect(noticedAxis([change('a', 100)], 0, 400).toEpochDay).toBe(400);
    expect(noticedAxis([change('a', 500)], 0, 400).toEpochDay).toBe(500);
  });
});

describe('where a mark sits', () => {
  test('a day halfway between the ends is halfway along', () => {
    const axis = noticedAxis([change('a', 200)], 0, 400);
    expect(axis.marks[0].position).toBeCloseTo(0.5, 10);
  });

  test('today is the right end when nothing was noticed after it', () => {
    expect(noticedAxis([change('a', 200)], 0, 400).todayPosition).toBe(1);
  });

  test('a line shorter than the floor opens backwards, so today stays its right end', () => {
    const axis = noticedAxis([change('a', 10)], 0, 20);
    expect(axis.toEpochDay).toBe(20);
    expect(axis.fromEpochDay).toBe(20 - AXIS_MIN_SPAN_DAYS);
    expect(axis.todayPosition).toBe(1);
  });

  test('marks read left to right, and two on the same day read by name', () => {
    const axis = noticedAxis(
      [change('skin', 300), change('voice', 100, { label: 'voice' }), change('breasts', 100, { label: 'breasts' })],
      0,
      400
    );
    expect(axis.marks.map((mark) => mark.key)).toEqual(['breasts', 'voice', 'skin']);
  });
});

describe('several in the same month', () => {
  test('marks too close to stand side by side stack, nearest the axis first', () => {
    const axis = noticedAxis([change('a', 100), change('b', 104), change('c', 108)], 0, 730);
    expect(axis.marks.map((mark) => mark.lane)).toEqual([0, 1, 2]);
    expect(axis.lanes).toBe(3);
  });

  test('marks with room between them share the bottom lane', () => {
    const axis = noticedAxis([change('a', 100), change('b', 400), change('c', 700)], 0, 730);
    expect(axis.marks.map((mark) => mark.lane)).toEqual([0, 0, 0]);
    expect(axis.lanes).toBe(1);
  });

  test('a lane is free again once the stack has moved on', () => {
    const axis = noticedAxis([change('a', 100), change('b', 104), change('c', 400), change('d', 404)], 0, 730);
    expect(axis.marks.map((mark) => mark.lane)).toEqual([0, 1, 0, 1]);
  });

  test('the gap a lane needs is a share of the whole line, so it holds at any span', () => {
    const step = Math.ceil(730 * MARK_MIN_GAP);
    const near = noticedAxis([change('a', 0), change('b', step - 1)], 0, 730);
    const far = noticedAxis([change('a', 0), change('b', step + 1)], 0, 730);
    expect(near.marks[1].lane).toBe(1);
    expect(far.marks[1].lane).toBe(0);
  });
});

describe('the ticks the axis is read against', () => {
  test('on the onset axis a tick is a whole month since the start, counted from zero', () => {
    const axis = noticedAxis([change('a', 100)], 0, 150);
    expect(axis.ticks.map((tick) => tick.monthsSinceOnset)).toEqual([0, 1, 2, 3, 4]);
    expect(axis.ticks[0].epochDay).toBe(0);
  });

  test('months are counted from the start day, not from the first of the month', () => {
    // 15 January 2026 is epoch day 20468; a month on is 15 February, 31 days later.
    const jan15 = 20468;
    const axis = noticedAxis([], jan15, jan15 + 40);
    expect(axis.ticks[1].epochDay).toBe(jan15 + 31);
  });

  test('a long axis names fewer months rather than crowding them', () => {
    const fiveYears = noticedAxis([], 0, 1826);
    expect(fiveYears.ticks.length).toBeLessThanOrEqual(8);
    expect(fiveYears.ticks.every((tick) => (tick.monthsSinceOnset ?? 0) % 12 === 0)).toBe(true);
  });

  test('a change noticed before the start gets its months counted backwards', () => {
    const axis = noticedAxis([change('a', -40)], 0, 150);
    expect(axis.ticks[0].monthsSinceOnset).toBe(-1);
  });

  test('the calendar axis ticks the first of the month and counts no months', () => {
    // 20 January 2026 is epoch day 20473; 1 February 2026 is 20485.
    const jan20 = 20473;
    const axis = noticedAxis([change('a', jan20)], null, jan20 + 100);
    expect(axis.ticks[0].epochDay).toBe(20485);
    expect(axis.ticks.every((tick) => tick.monthsSinceOnset === null)).toBe(true);
  });

  test('every tick is on the line', () => {
    const axis = noticedAxis([change('a', 100)], 0, 700);
    for (const tick of axis.ticks) {
      expect(tick.position).toBeGreaterThanOrEqual(0);
      expect(tick.position).toBeLessThanOrEqual(1);
    }
  });
});
