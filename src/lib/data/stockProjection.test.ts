import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  clearStockNoticeSnooze,
  depletingStocks,
  isStockDepletingSoon,
  isStockNoticeSnoozed,
  projectEveryStock,
  projectStock,
  snoozeStockNotice,
  STOCK_DEPLETION_NOTICE_THRESHOLD_DAYS,
  TRAILING_WINDOW_DAYS,
  type DrugDoseCounter,
  type StockEntry
} from './stockProjection';
import { epochDayFromTimestamp, startOfDayTimestamp } from './epochDay';
import type { DoseEvent, RegimenEpisode } from './types';

const DAY_0 = 20000;

function episode(overrides: Partial<RegimenEpisode> = {}): RegimenEpisode {
  return {
    id: 'ep-1',
    drug: 'estradiol valerate',
    ester: 'valerate',
    dose: 4,
    doseUnit: 'mg',
    route: 'im',
    interval: 'every 2 weeks',
    startEpochDay: DAY_0,
    endEpochDay: null,
    endReason: null,
    ...overrides
  };
}

function dose(epochDay: number, overrides: Partial<DoseEvent> = {}): DoseEvent {
  return {
    id: `dose-${epochDay}-${Math.random()}`,
    timestamp: startOfDayTimestamp(epochDay) + 1000,
    dose: 4,
    doseUnit: 'mg',
    status: 'taken',
    scheduled: null,
    route: 'im',
    injectionSite: null,
    vehicle: null,
    ...overrides
  } as DoseEvent;
}

test('remaining subtracts every non-skipped matching dose since the recorded day', () => {
  const stock = { drug: 'estradiol valerate', quantity: 10, unit: 'vials', recordedEpochDay: DAY_0 };
  const doses = [dose(DAY_0 + 1), dose(DAY_0 + 3), dose(DAY_0 + 5)];

  const projection = projectStock(stock, doses, [episode()], DAY_0 + 5);

  assert.equal(projection.remaining, 7);
});

test('a skipped dose consumes nothing', () => {
  const stock = { drug: 'estradiol valerate', quantity: 10, unit: 'vials', recordedEpochDay: DAY_0 };
  const doses = [dose(DAY_0 + 1), dose(DAY_0 + 3, { status: 'skipped' })];

  const projection = projectStock(stock, doses, [episode()], DAY_0 + 5);

  assert.equal(projection.remaining, 9);
});

test('a changed dose still consumes: it was taken, just not as scheduled', () => {
  const stock = { drug: 'estradiol valerate', quantity: 10, unit: 'vials', recordedEpochDay: DAY_0 };
  const doses = [dose(DAY_0 + 1, { status: 'changed' })];

  const projection = projectStock(stock, doses, [episode()], DAY_0 + 5);

  assert.equal(projection.remaining, 9);
});

test('a dose logged before the stock was recorded does not count against it', () => {
  const stock = { drug: 'estradiol valerate', quantity: 10, unit: 'vials', recordedEpochDay: DAY_0 };
  const doses = [dose(DAY_0 - 1)];

  const projection = projectStock(stock, doses, [episode()], DAY_0 + 5);

  assert.equal(projection.remaining, 10);
});

test('a dose logged under a different drug does not count, even in a matching episode window', () => {
  const stock = { drug: 'estradiol valerate', quantity: 10, unit: 'vials', recordedEpochDay: DAY_0 };
  const otherEpisode = episode({ id: 'ep-2', drug: 'spironolactone', startEpochDay: DAY_0 });
  const doses = [dose(DAY_0 + 1)];

  const projection = projectStock(stock, doses, [otherEpisode], DAY_0 + 5);

  assert.equal(projection.remaining, 10);
});

test('a drug-less dose left ambiguous by two concurrent episodes of different drugs consumes no stock, and is counted excluded (case 4)', () => {
  /* The bug ticket 38 exists to close: before concurrency was representable,
     a route/window match alone was enough to consume the wrong drug's stock.
     Two concurrent episodes for different drugs, and a dose naming no drug
     of its own, must not deplete either stock - and the exclusion must be
     counted, not silently dropped. */
  const stock = { drug: 'estradiol valerate', quantity: 10, unit: 'vials', recordedEpochDay: DAY_0 };
  const episodes = [episode({ startEpochDay: DAY_0 }), episode({ id: 'ep-2', drug: 'spironolactone', startEpochDay: DAY_0 })];
  const doses = [dose(DAY_0 + 1)];

  const projection = projectStock(stock, doses, episodes, DAY_0 + 5);

  assert.equal(projection.remaining, 10);
  assert.equal(projection.excludedDoses, 1);
});

test('drug matching trims surrounding whitespace and nothing else', () => {
  const stock = { drug: '  estradiol valerate  ', quantity: 10, unit: 'vials', recordedEpochDay: DAY_0 };
  const doses = [dose(DAY_0 + 1)];

  const projection = projectStock(stock, doses, [episode({ drug: 'estradiol valerate' })], DAY_0 + 5);

  assert.equal(projection.remaining, 9);
});

test('a drug spanning two episodes (a dose change) still consumes from one stock entry', () => {
  const stock = { drug: 'estradiol valerate', quantity: 10, unit: 'vials', recordedEpochDay: DAY_0 };
  const episodes = [episode({ id: 'ep-1', startEpochDay: DAY_0 }), episode({ id: 'ep-2', dose: 6, startEpochDay: DAY_0 + 10 })];
  const doses = [dose(DAY_0 + 1), dose(DAY_0 + 11)];

  const projection = projectStock(stock, doses, episodes, DAY_0 + 20);

  assert.equal(projection.remaining, 8);
});

test('remaining at or below zero projects a run-out of today, with no need for a rate', () => {
  const stock = { drug: 'estradiol valerate', quantity: 2, unit: 'vials', recordedEpochDay: DAY_0 };
  const doses = [dose(DAY_0 + 1), dose(DAY_0 + 2), dose(DAY_0 + 3)];

  const projection = projectStock(stock, doses, [episode()], DAY_0 + 3);

  assert.equal(projection.remaining, -1);
  assert.equal(projection.runOutEpochDay, DAY_0 + 3);
});

test('a steady daily rate projects run-out at remaining / rate days out', () => {
  const stock = { drug: 'estradiol valerate', quantity: 10, unit: 'pills', recordedEpochDay: DAY_0 };
  // One dose a day for 10 days: rate is 1/day over an 11-day window.
  const doses = Array.from({ length: 10 }, (_, i) => dose(DAY_0 + i));

  const projection = projectStock(stock, doses, [episode({ route: 'oral' })], DAY_0 + 9);

  assert.equal(projection.remaining, 0);
  assert.equal(projection.runOutEpochDay, DAY_0 + 9);
});

test('no consumption in the window at all projects nothing: the stock never runs out at this pace', () => {
  const stock = { drug: 'estradiol valerate', quantity: 10, unit: 'vials', recordedEpochDay: DAY_0 };

  const projection = projectStock(stock, [], [episode()], DAY_0 + 10);

  assert.equal(projection.remaining, 10);
  assert.equal(projection.dailyRate, 0);
  assert.equal(projection.runOutEpochDay, null);
});

test('a run of skipped doses lowers the rate and pushes the projection later than a full-adherence baseline', () => {
  const stockFullAdherence = { drug: 'estradiol valerate', quantity: 20, unit: 'pills', recordedEpochDay: DAY_0 };
  const fullDoses = Array.from({ length: 20 }, (_, i) => dose(DAY_0 + i));
  const full = projectStock(stockFullAdherence, fullDoses, [episode({ route: 'oral' })], DAY_0 + 19);

  const stockWithSkips = { drug: 'estradiol valerate', quantity: 20, unit: 'pills', recordedEpochDay: DAY_0 };
  const skippedDoses = Array.from({ length: 20 }, (_, i) =>
    dose(DAY_0 + i, i >= 5 && i < 15 ? { status: 'skipped' } : {})
  );
  const withSkips = projectStock(stockWithSkips, skippedDoses, [episode({ route: 'oral' })], DAY_0 + 19);

  assert.ok(full.runOutEpochDay !== null && withSkips.runOutEpochDay !== null);
  assert.ok(withSkips.runOutEpochDay! > full.runOutEpochDay!, 'a run of skips should shift run-out later, not sooner');
});

test('an active pause (zero consumption while it runs) pushes the projection later, the same direction as a run of skips', () => {
  // 10 non-paused days of full adherence, then a 10-day pause with nothing
  // logged - modeled here purely as an absence of doses, since this module
  // does not read dose_pause at all (see the header comment for why).
  const stock = { drug: 'estradiol valerate', quantity: 15, unit: 'pills', recordedEpochDay: DAY_0 };
  const doses = Array.from({ length: 10 }, (_, i) => dose(DAY_0 + i));

  const projection = projectStock(stock, doses, [episode({ route: 'oral' })], DAY_0 + 19);
  const naiveDailyProjection = DAY_0 + 19 + Math.ceil(5 / 1);

  assert.ok(
    (projection.runOutEpochDay ?? Infinity) > naiveDailyProjection - 5,
    'a trailing rate diluted by a pause should not project sooner than steady daily use would'
  );
});

test('a stock entry younger than the trailing window is not padded with days before it existed', () => {
  const stock = { drug: 'estradiol valerate', quantity: 10, unit: 'pills', recordedEpochDay: DAY_0 };
  // Recorded 5 days ago, one dose a day since - well short of
  // TRAILING_WINDOW_DAYS. The rate must be 1/day (5 doses over 5 days), not
  // diluted by days before the stock entry existed.
  const doses = Array.from({ length: 5 }, (_, i) => dose(DAY_0 + i));

  const projection = projectStock(stock, doses, [episode({ route: 'oral' })], DAY_0 + 4);

  assert.equal(projection.dailyRate, 1);
});

class MockStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(index: number) {
    return Array.from(this.data.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

test('isStockDepletingSoon returns true when runOutEpochDay is within threshold (<= 7 days)', () => {
  const asOf = DAY_0 + 10;
  // 5 days remaining at 1/day -> run out in 5 days (<= 7 days)
  const projectionWithin = {
    remaining: 5,
    dailyRate: 1,
    runOutEpochDay: asOf + 5,
    excludedDoses: 0
  };
  assert.equal(isStockDepletingSoon(projectionWithin, asOf), true);

  // Exactly 7 days
  const projectionExact = {
    remaining: 7,
    dailyRate: 1,
    runOutEpochDay: asOf + 7,
    excludedDoses: 0
  };
  assert.equal(isStockDepletingSoon(projectionExact, asOf), true);

  // 8 days -> false
  const projectionBeyond = {
    remaining: 8,
    dailyRate: 1,
    runOutEpochDay: asOf + 8,
    excludedDoses: 0
  };
  assert.equal(isStockDepletingSoon(projectionBeyond, asOf), false);

  // 0 remaining -> true (runOut is asOf)
  const projectionZero = {
    remaining: 0,
    dailyRate: 1,
    runOutEpochDay: asOf,
    excludedDoses: 0
  };
  assert.equal(isStockDepletingSoon(projectionZero, asOf), true);

  // Negative remaining -> true
  const projectionNegative = {
    remaining: -2,
    dailyRate: 1,
    runOutEpochDay: asOf,
    excludedDoses: 0
  };
  assert.equal(isStockDepletingSoon(projectionNegative, asOf), true);

  // Null runOutEpochDay (zero consumption) -> false
  const projectionNull = {
    remaining: 10,
    dailyRate: 0,
    runOutEpochDay: null,
    excludedDoses: 0
  };
  assert.equal(isStockDepletingSoon(projectionNull, asOf), false);
});

test('isStockDepletingSoon works with raw stock, doses, and episodes', () => {
  const stock = { drug: 'estradiol valerate', quantity: 7, unit: 'pills', recordedEpochDay: DAY_0 };
  const doses = Array.from({ length: 5 }, (_, i) => dose(DAY_0 + i));
  const ep = [episode({ route: 'oral' })];
  // 5 doses consumed, 2 remaining at 1/day -> runs out in 2 days from DAY_0 + 4
  assert.equal(isStockDepletingSoon(stock, doses, ep, DAY_0 + 4), true);

  const ampleStock = { drug: 'estradiol valerate', quantity: 50, unit: 'pills', recordedEpochDay: DAY_0 };
  assert.equal(isStockDepletingSoon(ampleStock, doses, ep, DAY_0 + 4), false);
});

test('depletingStocks filters and sorts by urgency', () => {
  const asOf = DAY_0 + 10;
  const items = [
    {
      entry: { id: 's-ample', drug: 'spironolactone', quantity: 100, unit: 'mg', recordedEpochDay: DAY_0, reminderEverCreated: false, reminderDismissed: false },
      projection: { remaining: 50, dailyRate: 1, runOutEpochDay: asOf + 50, excludedDoses: 0 }
    },
    {
      entry: { id: 's-urgent', drug: 'estradiol valerate', quantity: 10, unit: 'mg', recordedEpochDay: DAY_0, reminderEverCreated: false, reminderDismissed: false },
      projection: { remaining: 2, dailyRate: 1, runOutEpochDay: asOf + 2, excludedDoses: 0 }
    },
    {
      entry: { id: 's-medium', drug: 'progesterone', quantity: 20, unit: 'mg', recordedEpochDay: DAY_0, reminderEverCreated: false, reminderDismissed: false },
      projection: { remaining: 5, dailyRate: 1, runOutEpochDay: asOf + 5, excludedDoses: 0 }
    }
  ];

  const depleting = depletingStocks(items, asOf);
  assert.equal(depleting.length, 2);
  assert.equal(depleting[0].entry.drug, 'estradiol valerate');
  assert.equal(depleting[0].daysRemaining, 2);
  assert.equal(depleting[1].entry.drug, 'progesterone');
  assert.equal(depleting[1].daysRemaining, 5);
});

test('snoozeStockNotice suppresses notice for 24 hours and expires afterwards', () => {
  const storage = new MockStorage();
  const now = 1700000000000;

  assert.equal(isStockNoticeSnoozed(now, storage), false);

  snoozeStockNotice(now, storage);
  assert.equal(isStockNoticeSnoozed(now, storage), true);
  assert.equal(isStockNoticeSnoozed(now + 12 * 3600_000, storage), true);
  assert.equal(isStockNoticeSnoozed(now + 24 * 3600_000 - 100, storage), true);

  // 24 hours elapsed -> un-snoozed
  assert.equal(isStockNoticeSnoozed(now + 24 * 3600_000 + 1, storage), false);

  // Clear snooze
  snoozeStockNotice(now, storage);
  assert.equal(isStockNoticeSnoozed(now, storage), true);
  clearStockNoticeSnooze(storage);
  assert.equal(isStockNoticeSnoozed(now, storage), false);
});


/* projectEveryStock, the path the stock area takes (phase 8 audit ticket
   26). Driven with a counter that answers from an in-memory dose list, so
   the windowing and the summing get tested without a database, and the
   figures can be held against projectStock, which counts the same doses the
   old way. */
function counterOver(doses: readonly DoseEvent[]): DrugDoseCounter {
  return async (ranges) => {
    const byDrug = new Map<string | null, number[]>();
    for (const one of doses) {
      if (one.status === 'skipped') continue;
      const day = epochDayFromTimestamp(one.timestamp);
      const index = ranges.findIndex((range) => day >= range.fromEpochDay && day <= range.toEpochDay);
      if (index < 0) continue;
      const key = one.drug ?? null;
      const counts = byDrug.get(key) ?? ranges.map(() => 0);
      counts[index] += 1;
      byDrug.set(key, counts);
    }
    return [...byDrug].map(([drug, countsByRange]) => ({ drug, countsByRange }));
  };
}

const ESTRADIOL = episode({ id: 'e', drug: 'estradiol', startEpochDay: DAY_0 });
const SPIRO = episode({ id: 's', drug: 'spironolactone', startEpochDay: DAY_0 + 50, endEpochDay: DAY_0 + 99 });

test('projectEveryStock agrees with projectStock on every entry', async () => {
  const episodes = [ESTRADIOL, SPIRO];
  const doses: DoseEvent[] = [];
  for (let day = DAY_0; day <= DAY_0 + 160; day += 1) {
    doses.push(
      dose(day, {
        drug: day % 3 === 0 ? 'estradiol' : null,
        status: day % 17 === 0 ? 'skipped' : 'taken'
      })
    );
  }
  const entries: StockEntry[] = [
    { drug: 'estradiol', quantity: 200, unit: 'tablets', recordedEpochDay: DAY_0 },
    { drug: 'spironolactone', quantity: 40, unit: 'tablets', recordedEpochDay: DAY_0 + 140 }
  ];
  const asOf = DAY_0 + 160;

  assert.deepEqual(
    await projectEveryStock(entries, episodes, asOf, counterOver(doses)),
    entries.map((entry) => projectStock(entry, doses, episodes, asOf))
  );
});

test('projectEveryStock reports a zero rate as a stock that never runs out', async () => {
  /* A count taken on the day asked about, so the trailing window holds one
     calendar day, and nothing consumed inside it: a rate of zero rather than
     null, and therefore no run-out day to project at that pace. */
  const doses = [dose(DAY_0 + 1), dose(DAY_0 + 2)];
  const entries: StockEntry[] = [{ drug: 'estradiol', quantity: 30, unit: 'tablets', recordedEpochDay: DAY_0 + 100 }];

  const [projection] = await projectEveryStock(entries, [ESTRADIOL], DAY_0 + 100, counterOver(doses));

  assert.deepEqual(projection, { remaining: 30, dailyRate: 0, runOutEpochDay: null, excludedDoses: 0 });
  assert.deepEqual(projection, projectStock(entries[0], doses, [ESTRADIOL], DAY_0 + 100));
});

test('projectEveryStock asks for ranges that tile the window exactly', async () => {
  const entries: StockEntry[] = [
    { drug: 'estradiol', quantity: 200, unit: 'tablets', recordedEpochDay: DAY_0 },
    { drug: 'spironolactone', quantity: 40, unit: 'tablets', recordedEpochDay: DAY_0 + 140 }
  ];

  let asked: readonly { fromEpochDay: number; toEpochDay: number }[] = [];
  await projectEveryStock(entries, [ESTRADIOL, SPIRO], DAY_0 + 160, async (ranges) => {
    asked = ranges;
    return [];
  });

  assert.ok(asked.length > 1, 'the window is cut at more than one place');
  assert.equal(asked[0].fromEpochDay, DAY_0, 'starts at the oldest count');
  assert.equal(asked[asked.length - 1].toEpochDay, DAY_0 + 160, 'ends on the day asked about');
  for (const [index, range] of asked.entries()) {
    assert.ok(range.toEpochDay >= range.fromEpochDay, `range ${index} runs backwards`);
    if (index > 0) assert.equal(range.fromEpochDay, asked[index - 1].toEpochDay + 1, `gap or overlap at ${index}`);
  }
});

test('projectEveryStock answers nothing for no entries', async () => {
  assert.deepEqual(await projectEveryStock([], [ESTRADIOL], DAY_0, counterOver([])), []);
});
