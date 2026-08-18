/* Factor-impact correlation cards (phase 4 ticket 21): the pure ranking
   math, tested without a driver. journal/correlationCards.test.ts covers
   the area that wires this to the dose log and the day-average queries. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { doseDayInsight, doseDaysFromEvents, rankCorrelationCards } from './correlationCards';
import { startOfDayTimestamp } from './epochDay';
import type { DayAverage } from './journal/stats';
import type { DoseEvent } from './types';

const DAY_0 = 20000;

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

function point(day: number, value: number, count = 1): DayAverage {
  return { day, value, count };
}

test('doseDaysFromEvents keys by epoch day and drops skipped doses - one never happened', () => {
  const days = doseDaysFromEvents([dose(DAY_0), dose(DAY_0 + 1, { status: 'skipped' }), dose(DAY_0 + 2, { status: 'changed' })]);

  assert.deepEqual([...days].sort((a, b) => a - b), [DAY_0, DAY_0 + 2]);
});

test('doseDayInsight splits day averages by dose day and folds multi-entry days back to an entry-weighted average', () => {
  const doseDays = new Set([DAY_0, DAY_0 + 1, DAY_0 + 2]);
  const days = [
    point(DAY_0, 4, 2), // dose day, two entries averaging 4 => total 8
    point(DAY_0 + 1, 4),
    point(DAY_0 + 2, 4),
    point(DAY_0 + 3, 2), // no dose
    point(DAY_0 + 4, 2)
  ];

  const insight = doseDayInsight(days, doseDays);

  assert.ok(insight);
  assert.equal(insight!.count, 4);
  assert.equal(insight!.withAvg, 4);
  assert.equal(insight!.withoutAvg, 2);
});

test('doseDayInsight returns null below the 3-entry floor - an average over two numbers says nothing', () => {
  const insight = doseDayInsight([point(DAY_0, 4), point(DAY_0 + 1, 2)], new Set([DAY_0]));

  assert.equal(insight, null);
});

test('doseDayInsight returns null with nothing to compare against on the other side', () => {
  const insight = doseDayInsight([point(DAY_0, 4), point(DAY_0 + 1, 4), point(DAY_0 + 2, 4)], new Set([DAY_0, DAY_0 + 1, DAY_0 + 2]));

  assert.equal(insight, null);
});

test('rankCorrelationCards ranks by normalized span, not raw difference, so scales stay comparable', () => {
  const cards = rankCorrelationCards(
    [
      {
        metric: 'mood',
        range: { min: 1, max: 5 },
        // A 1-point move on a 1-5 range is a 0.25 normalized span.
        tagInsights: [{ id: 'tag-a', count: 5, withAvg: 4, withoutAvg: 3 }],
        doseDay: null
      },
      {
        metric: 'femininity',
        range: { min: 0, max: 100 },
        // A 5-point move on a 0-100 range is a 0.05 normalized span - smaller than the mood card above despite the bigger raw number.
        tagInsights: [{ id: 'tag-b', count: 5, withAvg: 55, withoutAvg: 50 }],
        doseDay: null
      }
    ],
    10
  );

  assert.deepEqual(cards.map((c) => c.metric), ['mood', 'femininity']);
});

test('rankCorrelationCards caps at the requested limit', () => {
  const tagInsights = Array.from({ length: 5 }, (_, i) => ({ id: `tag-${i}`, count: 5, withAvg: 4 + i, withoutAvg: 3 }));

  const cards = rankCorrelationCards([{ metric: 'mood', range: { min: 1, max: 5 }, tagInsights, doseDay: null }], 2);

  assert.equal(cards.length, 2);
});

test('rankCorrelationCards includes a dose-day card alongside tag cards for the same metric', () => {
  const cards = rankCorrelationCards(
    [
      {
        metric: 'mood',
        range: { min: 1, max: 5 },
        tagInsights: [{ id: 'tag-a', count: 5, withAvg: 4, withoutAvg: 3 }],
        doseDay: { count: 5, withAvg: 2, withoutAvg: 4 }
      }
    ],
    10
  );

  assert.deepEqual(
    cards.map((c) => c.occurrence),
    [
      { kind: 'doseDay' },
      { kind: 'tag', id: 'tag-a' }
    ]
  );
});
