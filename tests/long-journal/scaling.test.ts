import { expect, test } from 'vitest';
import { compareJournalSizes } from './scaling.ts';

const measurement = (name: string, ms: number) => ({ name, ms });
const fixture = (entries: number, measurements: ReturnType<typeof measurement>[]) => ({
  summary: { entries }, measurements
});

test('compares every measurement by name against the actual entry ratio', () => {
  const result = compareJournalSizes(
    fixture(300, [measurement('stats', 2), measurement('home', 5)]),
    fixture(3300, [measurement('home', 4), measurement('stats', 22)])
  );
  expect(result.sizeRatio).toBe(11);
  expect(result.limit).toBe(22);
  expect(result.measurements).toEqual([
    { name: 'home', oneYearMs: 5, tenYearMs: 4, ratio: 0.8 },
    { name: 'stats', oneYearMs: 2, tenYearMs: 22, ratio: 11 }
  ]);
  expect(result.breaches).toEqual([]);
});

test('quadratic growth fails while linear growth keeps noise headroom', () => {
  const result = compareJournalSizes(
    fixture(300, [measurement('linear', 2), measurement('quadratic', 2)]),
    fixture(3000, [measurement('linear', 25), measurement('quadratic', 200)])
  );
  expect(result.breaches).toHaveLength(1);
  expect(result.breaches[0]).toContain('quadratic');
  expect(result.breaches[0]).toContain('100.00x');
});

test.each([
  [fixture(300, [measurement('stats', 1)]), fixture(3000, [])],
  [fixture(300, []), fixture(3000, [measurement('stats', 1)])],
  [fixture(300, [measurement('stats', 1), measurement('stats', 2)]), fixture(3000, [measurement('stats', 1)])],
  [fixture(300, [measurement('stats', 0)]), fixture(3000, [measurement('stats', 1)])],
  [fixture(300, [measurement('stats', 1)]), fixture(3000, [measurement('stats', NaN)])],
  [fixture(0, [measurement('stats', 1)]), fixture(3000, [measurement('stats', 1)])]
])('incomplete or invalid scaling data fails closed', (small, large) => {
  expect(() => compareJournalSizes(small, large)).toThrow();
});
