import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SPAN_DAYS,
  defaultSpan,
  eraBands,
  historyStart,
  moveHandle,
  nearestHandle,
  railPosition,
  dayAtPosition,
  snapDay,
  spanGrain,
  spanRangeQuery,
  yearTicks
} from './lookBackSpan';
import { parseWrappedRangeParams } from './wrappedRange';

const TODAY = 20700;

describe('historyStart: the earliest day the person authored anything dated', () => {
  it('reaches back to a milestone dated before the first entry', () => {
    const start = historyStart(
      {
        bounds: { firstEpochDay: 20000, lastEpochDay: TODAY },
        milestones: [{ epochDay: 18000 }, { epochDay: 20500 }],
        eras: []
      },
      TODAY
    );
    expect(start).toBe(18000);
  });

  it('reaches back to an era that starts before either', () => {
    const start = historyStart(
      {
        bounds: { firstEpochDay: 20000, lastEpochDay: TODAY },
        milestones: [{ epochDay: 19000 }],
        eras: [{ id: 'a', startEpochDay: 17000, endEpochDay: 19000 }]
      },
      TODAY
    );
    expect(start).toBe(17000);
  });

  it('ignores a milestone still ahead and an era with no start', () => {
    const start = historyStart(
      {
        bounds: { firstEpochDay: 20000, lastEpochDay: TODAY },
        milestones: [{ epochDay: TODAY + 40 }],
        eras: [{ id: 'a', startEpochDay: null, endEpochDay: 20100 }]
      },
      TODAY
    );
    expect(start).toBe(20000);
  });

  it('is null when nothing dated exists yet', () => {
    expect(historyStart({ bounds: null, milestones: [], eras: [] }, TODAY)).toBeNull();
    expect(historyStart({ bounds: null, milestones: [{ epochDay: TODAY + 1 }], eras: [] }, TODAY)).toBeNull();
  });

  it('never reaches past today, even on a journal with only future-dated entries', () => {
    const start = historyStart(
      { bounds: { firstEpochDay: TODAY + 3, lastEpochDay: TODAY + 9 }, milestones: [], eras: [] },
      TODAY
    );
    expect(start).toBe(TODAY);
  });
});

describe('defaultSpan: the door opens on the last thirty days, clamped to the rail', () => {
  it('ends today and runs thirty days back', () => {
    expect(defaultSpan(18000, TODAY)).toEqual({ start: TODAY - DEFAULT_SPAN_DAYS + 1, end: TODAY });
  });

  it('is the whole rail on a shorter history', () => {
    expect(defaultSpan(TODAY - 4, TODAY)).toEqual({ start: TODAY - 4, end: TODAY });
  });
});

describe('spanGrain: a handle moves in days, weeks or months by how long the rail is', () => {
  it('steps by day on a short rail, by week on a longer one, by month past two years', () => {
    expect(spanGrain(30)).toBe(1);
    expect(spanGrain(120)).toBe(1);
    expect(spanGrain(121)).toBe(7);
    expect(spanGrain(730)).toBe(7);
    expect(spanGrain(731)).toBe(30);
  });
});

describe('snapDay: a pointed-at day lands on the grain, or on a magnet close to it', () => {
  const rail = { start: 18000, today: TODAY };

  it('snaps to the grain counted back from today', () => {
    expect(snapDay(TODAY - 10, { ...rail, grain: 7, magnets: [], toleranceDays: 0 })).toBe(TODAY - 7);
    expect(snapDay(TODAY - 11, { ...rail, grain: 7, magnets: [], toleranceDays: 0 })).toBe(TODAY - 14);
  });

  it('prefers a magnet within tolerance over the grain', () => {
    expect(snapDay(TODAY - 10, { ...rail, grain: 7, magnets: [TODAY - 12], toleranceDays: 3 })).toBe(TODAY - 12);
  });

  it('ignores a magnet out of tolerance', () => {
    expect(snapDay(TODAY - 10, { ...rail, grain: 7, magnets: [TODAY - 20], toleranceDays: 3 })).toBe(TODAY - 7);
  });

  it('never leaves the rail', () => {
    expect(snapDay(17000, { ...rail, grain: 30, magnets: [], toleranceDays: 0 })).toBe(18000);
    expect(snapDay(TODAY + 50, { ...rail, grain: 1, magnets: [], toleranceDays: 0 })).toBe(TODAY);
  });
});

describe('the rail is a linear scale between its start and today', () => {
  it('places the ends at 0 and 1 and reads a position back to its day', () => {
    expect(railPosition(18000, 18000, TODAY)).toBe(0);
    expect(railPosition(TODAY, 18000, TODAY)).toBe(1);
    expect(dayAtPosition(0.5, 18000, 18010)).toBe(18005);
    expect(dayAtPosition(-2, 18000, 18010)).toBe(18000);
    expect(dayAtPosition(3, 18000, 18010)).toBe(18010);
  });

  it('is whole when the rail is one day long', () => {
    expect(railPosition(TODAY, TODAY, TODAY)).toBe(1);
  });
});

describe('moving a handle keeps the span a span', () => {
  it('moves the named handle and never crosses the other', () => {
    expect(moveHandle({ start: 100, end: 200 }, 'start', 150)).toEqual({ start: 150, end: 200 });
    expect(moveHandle({ start: 100, end: 200 }, 'start', 250)).toEqual({ start: 200, end: 200 });
    expect(moveHandle({ start: 100, end: 200 }, 'end', 50)).toEqual({ start: 100, end: 100 });
  });

  it('names the nearer handle for a tap on the rail, the end on a tie', () => {
    expect(nearestHandle({ start: 100, end: 200 }, 120)).toBe('start');
    expect(nearestHandle({ start: 100, end: 200 }, 190)).toBe('end');
    expect(nearestHandle({ start: 100, end: 200 }, 150)).toBe('end');
  });
});

describe('eraBands: eras clamped to the rail, open bounds reaching its ends', () => {
  it('clamps both ends and marks which were open', () => {
    const bands = eraBands(
      [
        { id: 'before', name: 'Before', startEpochDay: null, endEpochDay: 18500 },
        { id: 'mid', name: 'Middle', startEpochDay: 18501, endEpochDay: 19000 },
        { id: 'now', name: 'Now', startEpochDay: 19001, endEpochDay: null }
      ],
      18000,
      TODAY
    );
    expect(bands).toEqual([
      { id: 'before', name: 'Before', start: 18000, end: 18500, openStart: true, openEnd: false },
      { id: 'mid', name: 'Middle', start: 18501, end: 19000, openStart: false, openEnd: false },
      { id: 'now', name: 'Now', start: 19001, end: TODAY, openStart: false, openEnd: true }
    ]);
  });

  it('drops an era that lies wholly ahead of today', () => {
    expect(
      eraBands([{ id: 'x', name: 'Later', startEpochDay: TODAY + 1, endEpochDay: null }], 18000, TODAY)
    ).toEqual([]);
  });
});

describe('spanRangeQuery: a picked span is read at the same URL the picker writes', () => {
  it('round-trips through the wrapped range parser to the same two days', () => {
    const span = { start: 20655, end: 20690 };
    const query = spanRangeQuery(span);
    expect(query.startsWith('?named=custom')).toBe(true);
    const params = new URLSearchParams(query);
    const parsed = parseWrappedRangeParams(params.get('named'), params.get('from'), params.get('to'), TODAY);
    expect(parsed.choice).toBe('custom');
    expect(parsed.range).toEqual(span);
  });
});

describe('yearTicks: one mark per new year inside the rail', () => {
  it('lists each 1 January after the start and up to today', () => {
    /* 19723 is 2024-01-01, 20089 is 2025-01-01, 20454 is 2026-01-01. */
    expect(yearTicks(19600, 20500)).toEqual([
      { epochDay: 19723, year: 2024 },
      { epochDay: 20089, year: 2025 },
      { epochDay: 20454, year: 2026 }
    ]);
  });

  it('has no tick on a rail that crosses no new year', () => {
    expect(yearTicks(19730, 19800)).toEqual([]);
  });
});
