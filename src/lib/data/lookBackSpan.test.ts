import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SPAN_DAYS,
  defaultSpan,
  eraBands,
  eraOfferDue,
  historyBands,
  historyKindsPresent,
  historyStart,
  moveHandle,
  nearestHandle,
  railLegendKinds,
  railPosition,
  dayAtPosition,
  snapDay,
  grainAt,
  spanRangeQuery,
  surgeryMarks,
  yearTicks
} from './lookBackSpan';
import { annotationsInRange, type ChartAnnotationSource } from '../charts/annotations';
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
        eras: [{ id: 'a', name: 'A', startEpochDay: 17000, endEpochDay: 19000 }]
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
        eras: [{ id: 'a', name: 'A', startEpochDay: null, endEpochDay: 20100 }]
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

describe('grainAt: a handle moves in days, weeks or months by how dense the rail is where it stands', () => {
  it('steps by day at three pixels a day, by week at three a week, by month below', () => {
    expect(grainAt(6)).toBe(1);
    expect(grainAt(3)).toBe(1);
    expect(grainAt(2.9)).toBe(7);
    expect(grainAt(3 / 7)).toBe(7);
    expect(grainAt(0.4)).toBe(30);
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

describe('the rail is a square-root scale between its start and today', () => {
  it('places the ends at 0 and 1 and reads a position back to its day', () => {
    expect(railPosition(18000, 18000, TODAY)).toBe(0);
    expect(railPosition(TODAY, 18000, TODAY)).toBe(1);
    /* Halfway back in days is not halfway along: a quarter of the length
       back sits at the midpoint. */
    expect(railPosition(18000 + 7500, 18000, 18000 + 10000)).toBeCloseTo(0.5, 6);
    expect(dayAtPosition(0.5, 18000, 18010)).toBe(18008);
    expect(dayAtPosition(-2, 18000, 18010)).toBe(18000);
    expect(dayAtPosition(3, 18000, 18010)).toBe(18010);
  });

  it('gives the last month more room than a linear rail would, on a long history', () => {
    const sixYears = TODAY - 6 * 365;
    const month = 1 - railPosition(TODAY - 30, sixYears, TODAY);
    expect(month).toBeGreaterThan(0.1);
    expect(month).toBeLessThan(0.15);
    expect(1 - railPosition(TODAY - 365, sixYears, TODAY)).toBeCloseTo(Math.sqrt(1 / 6), 6);
  });

  it('reads a position back to the day it came from', () => {
    for (const day of [18000, 18500, 19999, TODAY - 1, TODAY]) {
      expect(dayAtPosition(railPosition(day, 18000, TODAY), 18000, TODAY)).toBe(day);
    }
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

describe('the rail draws every dated history, not only the eras', () => {
  const RAIL_START = 18000;
  /* The four record kinds the rail reads, put through the query's own
     selection so these read the shapes the screen really hands over
     (charts/annotations.ts) rather than a hand-built copy of them. */
  const sources: ChartAnnotationSource[] = [
    { id: 'e1', kind: 'regimen', name: 'Estradiol', startEpochDay: 17000, endEpochDay: 19000 },
    { id: 'e2', kind: 'regimen', name: 'Estradiol valerate', startEpochDay: 19001, endEpochDay: null },
    { id: 't1', kind: 'tryout', name: 'Alex', startEpochDay: 20000, endEpochDay: 20100 },
    { id: 's1', kind: 'surgery', name: 'Orchiectomy', startEpochDay: 20300, endEpochDay: null },
    /* Four kinds the same query returns and the rail does not draw: a
       milestone and an era already have their own marks and bands here, a
       recovery window is a reading of a procedure rather than a stretch the
       person lived through as its own thing, and a journaling pause came
       off the rail on the sign-off renders - it is the absence of a journal
       rather than a stretch of a life, and the charts still band it. */
    { id: 'p1', kind: 'journalingPause', name: null, startEpochDay: 20200, endEpochDay: 20230 },
    { id: 'm1', kind: 'milestone', name: 'Came out', startEpochDay: 20400, endEpochDay: null },
    { id: 'era1', kind: 'era', name: 'First year', startEpochDay: 19500, endEpochDay: null },
    { id: 'r1', kind: 'recovery', name: 'Orchiectomy', startEpochDay: 20301, endEpochDay: 20390 }
  ];
  const annotations = annotationsInRange(sources, { from: RAIL_START, to: TODAY, today: TODAY });

  it('takes the two stretch kinds and nothing else, clamped to the rail', () => {
    expect(historyBands(annotations)).toEqual([
      { id: 'e1', kind: 'regimen', name: 'Estradiol', start: RAIL_START, end: 19000, openStart: true, openEnd: false },
      { id: 'e2', kind: 'regimen', name: 'Estradiol valerate', start: 19001, end: TODAY, openStart: false, openEnd: true },
      { id: 't1', kind: 'tryout', name: 'Alex', start: 20000, end: 20100, openStart: false, openEnd: false }
    ]);
  });

  it('takes a procedure as a mark on its day', () => {
    expect(surgeryMarks(annotations)).toEqual([{ id: 's1', name: 'Orchiectomy', epochDay: 20300 }]);
  });

  it('gives each kind present its own row, in the rail’s own order', () => {
    expect(historyKindsPresent(historyBands(annotations))).toEqual(['regimen', 'tryout']);
  });

  it('leaves out a kind this journal has none of', () => {
    const onlyTryouts = historyBands(
      annotationsInRange([sources.find((s) => s.kind === 'tryout')!], { from: RAIL_START, to: TODAY, today: TODAY })
    );
    expect(historyKindsPresent(onlyTryouts)).toEqual(['tryout']);
  });

  it('names in the legend only the kinds this journal has', () => {
    expect(railLegendKinds(historyBands(annotations), surgeryMarks(annotations), true)).toEqual([
      'era',
      'regimen',
      'tryout',
      'surgery'
    ]);
    expect(railLegendKinds([], [], false)).toEqual([]);
    expect(railLegendKinds([], surgeryMarks(annotations), false)).toEqual(['surgery']);
  });

  it('sets the span to the thirty days ending on a mark', () => {
    const mark = surgeryMarks(annotations)[0];
    expect(defaultSpan(RAIL_START, mark.epochDay)).toEqual({
      start: mark.epochDay - DEFAULT_SPAN_DAYS + 1,
      end: mark.epochDay
    });
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

describe('eraOfferDue: the "name this stretch" offer raises once per span', () => {
  it('is due for a span nothing has handled yet', () => {
    expect(eraOfferDue({ start: 20600, end: 20630 }, [])).toBe(true);
  });

  it('is not due for the exact span already handled', () => {
    const span = { start: 20600, end: 20630 };
    expect(eraOfferDue(span, [span])).toBe(false);
  });

  it('is not due for a span that only overlaps a handled one, nudged a day', () => {
    expect(eraOfferDue({ start: 20601, end: 20630 }, [{ start: 20600, end: 20630 }])).toBe(false);
  });

  it('is not due for a span narrowed inside one already handled', () => {
    expect(eraOfferDue({ start: 20610, end: 20620 }, [{ start: 20600, end: 20630 }])).toBe(false);
  });

  it('is due again for a span that shares no day with anything handled', () => {
    expect(eraOfferDue({ start: 20700, end: 20730 }, [{ start: 20600, end: 20630 }])).toBe(true);
  });
});
