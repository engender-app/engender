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

test('a retry written by another tab is not cleared by this sweep', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }
  };
  markOrphanSweepComplete(100, storage);
  markOrphanSweepDue(storage);
  const started = orphanSweepRequestVersion(storage);
  const retryKey = [...values.keys()].find(key => key.endsWith('-retry'))!;
  storage.setItem(retryKey, 'other-tab');
  markOrphanSweepComplete(101, storage, started);
  expect(shouldSweepOrphans(101, storage)).toBe(true);
});

test('a retry between the final read and completion write remains due', () => {
  const values = new Map<string, string>();
  let injectRetry = false;
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (injectRetry && value === '101') {
        injectRetry = false;
        markOrphanSweepDue(storage);
      }
      values.set(key, value);
    }
  };
  markOrphanSweepComplete(100, storage);
  const started = orphanSweepRequestVersion(storage);
  injectRetry = true;
  markOrphanSweepComplete(101, storage, started);
  expect(shouldSweepOrphans(101, storage)).toBe(true);
});
