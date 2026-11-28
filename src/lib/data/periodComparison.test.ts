import { test, expect } from 'vitest';
import {
  biggestChange,
  chronological,
  defaultSideA,
  orderScales,
  tagPairs,
  yearEarlier,
  type ScaleSides
} from './periodComparison';
import { epochDayFromLocalDate, localDateFromEpochDay } from './epochDay';

const day = (y: number, m: number, d: number) => epochDayFromLocalDate(new Date(y, m - 1, d));
const ymd = (epochDay: number) => {
  const d = localDateFromEpochDay(epochDay);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

test('yearEarlier keeps the length and starts on the same calendar day a year before', () => {
  const a = { start: day(2026, 10, 28), end: day(2026, 11, 26) };
  const b = yearEarlier(a);
  expect(ymd(b.start)).toBe('2025-10-28');
  expect(b.end - b.start).toBe(a.end - a.start);
});

test('yearEarlier lands a 29 February start on 28 February and still keeps the length', () => {
  const a = { start: day(2024, 2, 29), end: day(2024, 3, 6) };
  const b = yearEarlier(a);
  expect(ymd(b.start)).toBe('2023-2-28');
  expect(b.end - b.start).toBe(6);
});

test('defaultSideA is the last 30 days through today', () => {
  expect(defaultSideA(1000)).toEqual({ start: 971, end: 1000 });
});

const scales: ScaleSides[] = [
  // Raw change 10 on a 0-100 track: 0.10 of its range.
  { key: 'gender', min: 0, max: 100, a: 60, b: 50 },
  // Raw change 1 on mood's 1-5 track: 0.25 of its range, the largest.
  { key: 'mood', min: 1, max: 5, a: 3, b: 4 },
  // Raw change 6 on a 0-100 track: 0.06.
  { key: 'dysphoria', min: 0, max: 100, a: 40, b: 46 },
  { key: 'empty', min: 0, max: 10, a: null, b: 5 }
];

test('biggestChange picks the largest change relative to the range, not the largest raw one', () => {
  expect(biggestChange(scales)?.key).toBe('mood');
});

test('biggestChange ignores scales missing a side and answers null when none has both', () => {
  expect(biggestChange([{ key: 'x', min: 0, max: 10, a: null, b: 4 }])).toBeNull();
  expect(biggestChange([])).toBeNull();
});

test('orderScales sorts by relative change and puts one-sided scales last', () => {
  expect(orderScales(scales).map((s) => s.key)).toEqual(['mood', 'gender', 'dysphoria', 'empty']);
});

test('tagPairs takes the union of both top fives with each side counted', () => {
  const a = [
    { id: 't1', count: 9 },
    { id: 't2', count: 7 },
    { id: 't3', count: 5 },
    { id: 't4', count: 4 },
    { id: 't5', count: 3 },
    { id: 't6', count: 1 }
  ];
  const b = [
    { id: 't7', count: 8 },
    { id: 't1', count: 2 },
    { id: 't6', count: 2 }
  ];
  const pairs = tagPairs(a, b);
  expect(pairs.map((p) => p.id)).toEqual(['t1', 't2', 't3', 't4', 't5', 't7', 't6']);
  expect(pairs.find((p) => p.id === 't6')).toEqual({ id: 't6', a: 1, b: 2 });
  expect(pairs.find((p) => p.id === 't7')).toEqual({ id: 't7', a: 0, b: 8 });
});

test('chronological orders the two sides earlier first, B first on a tie', () => {
  const a = { start: 100, end: 120 };
  const b = { start: 79, end: 99 };
  expect(chronological(a, b)).toEqual({ first: 'b', second: 'a' });
  expect(chronological(b, a)).toEqual({ first: 'a', second: 'b' });
  expect(chronological(a, a)).toEqual({ first: 'b', second: 'a' });
});
