import { expect, test } from 'vitest';
import { markOrphanSweepComplete, markOrphanSweepDue, orphanSweepRequestVersion, shouldSweepOrphans } from './orphan-sweep-schedule';

test('successful sweep delays the next one for seven days; failure makes it due', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }
  };
  const day = 24 * 60 * 60 * 1000;
  expect(shouldSweepOrphans(10 * day, storage)).toBe(true);
  markOrphanSweepComplete(10 * day, storage);
  expect(shouldSweepOrphans(16 * day, storage)).toBe(false);
  expect(shouldSweepOrphans(17 * day, storage)).toBe(true);
  markOrphanSweepComplete(17 * day, storage);
  markOrphanSweepDue(storage);
  expect(shouldSweepOrphans(17 * day, storage)).toBe(true);
});

test('a delete failure during a sweep keeps the retry due', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }
  };
  const started = orphanSweepRequestVersion();
  markOrphanSweepDue(storage);
  markOrphanSweepComplete(100, storage, started);
  expect(shouldSweepOrphans(100, storage)).toBe(true);
});
