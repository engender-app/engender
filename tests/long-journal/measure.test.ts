/* The harness's own tests (phase 2 ticket 20). Node tier, over node:sqlite
   and a fake file store, at four months rather than ten years: what these
   check is that the harness measures what it says it measures and that
   budgets.json covers exactly what it produces. The numbers themselves are
   the browser tier's job, where the driver is encrypted and the storage is
   real.

   The budget file being complete is worth a test rather than a review: a
   measurement with no budget entry is one CI silently stops watching, and
   it fails open. */

import { expect, test } from 'vitest';
import { openJournal } from '../../src/lib/data/journal/journal.ts';
import { fakeFileStore } from '../../src/lib/data/photos/test-support/fake-file-store.ts';
import { migratedDb } from '../../src/lib/data/sqlite/test-support/migrated-db.ts';
import { generateLongJournal } from './generate.ts';
import { measureLongJournal, type Measurement } from './measure.ts';
import { budgets, breaches, overTarget } from './budgets.mjs';
import { bytePatternPhoto } from './test-support.ts';

async function measureSmallJournal(sampleHeap = async () => null as number | null): Promise<Measurement[]> {
  // The same file store the journal was opened with, which is what the
  // harness's caller hands it - the thumbnail reads have to reach the
  // bytes the generator wrote.
  const files = fakeFileStore();
  const journal = openJournal(await migratedDb(), files);
  await journal.reconcileBuiltIns();
  const summary = await generateLongJournal(journal, { seed: 11, days: 120, makePhoto: bytePatternPhoto });
  return measureLongJournal(journal, files, { today: summary.lastEpochDay, summary, sampleHeap });
}

test('every measurement carries a name, a description, a time and a detail line', async () => {
  const measurements = await measureSmallJournal();

  expect(measurements.length).toBeGreaterThan(5);
  for (const m of measurements) {
    expect(m.name, 'a measurement with no name cannot be budgeted').toMatch(/^[a-z-]+$/);
    expect(m.what).not.toBe('');
    expect(m.ms).toBeGreaterThanOrEqual(0);
    expect(m.detail).not.toBe('');
  }
  expect(new Set(measurements.map((m) => m.name)).size).toBe(measurements.length);
});

test('the harness covers all five places a decade of Journal is read', async () => {
  const names = (await measureSmallJournal()).map((m) => m.name);

  expect(names.some((n) => n.startsWith('calendar'))).toBe(true);
  expect(names.some((n) => n.startsWith('stats'))).toBe(true);
  expect(names.some((n) => n.startsWith('search'))).toBe(true);
  expect(names.some((n) => n.startsWith('archive'))).toBe(true);
  expect(names.some((n) => n.startsWith('photo-grid'))).toBe(true);
});

test('heap is null where the platform will not answer, and a number where it will', async () => {
  expect((await measureSmallJournal()).every((m) => m.heapBytes === null)).toBe(true);

  let sample = 1_000_000;
  const rising = async () => (sample += 250_000);
  expect((await measureSmallJournal(rising)).every((m) => m.heapBytes === 250_000)).toBe(true);
});

test('budgets.json covers exactly what the harness measures', async () => {
  const measured = (await measureSmallJournal()).map((m) => m.name).sort();
  expect(Object.keys(budgets.measurements).sort()).toEqual(measured);
});

test('every budget leaves room above the baseline it was set from', () => {
  for (const [name, budget] of Object.entries(budgets.measurements)) {
    expect(budget.budgetMs, `${name} has no headroom over its baseline`).toBeGreaterThan(budget.baselineMs);
    expect(budget.targetMs, `${name} has no interaction target`).toBeGreaterThan(0);
  }
});

test('a measurement over budget is reported, and one under it is not', () => {
  const [name, budget] = Object.entries(budgets.measurements)[0];
  const under = { name, what: 'x', ms: budget.budgetMs - 1, heapBytes: null, detail: 'x' };
  const over = { ...under, ms: budget.budgetMs + 1 };

  expect(breaches([under])).toEqual([]);
  expect(breaches([over])).toHaveLength(1);
  expect(breaches([over])[0]).toContain(name);
});

test('a measurement with no budget entry is a breach, not a pass', () => {
  const stray = { name: 'not-budgeted', what: 'x', ms: 1, heapBytes: null, detail: 'x' };
  expect(breaches([stray])).toHaveLength(1);
});

test('a baseline past its target is reported, and one under it is not', () => {
  const table = {
    slow: { what: 'x', baselineMs: 900, budgetMs: 4500, targetMs: 250, heapBaselineBytes: null, heapBudgetBytes: null },
    quick: { what: 'x', baselineMs: 9, budgetMs: 200, targetMs: 250, heapBaselineBytes: null, heapBudgetBytes: null }
  };

  expect(overTarget(table)).toHaveLength(1);
  expect(overTarget(table)[0]).toContain('slow');
});

test('a heap budget is honoured where one is set, and web sets none', () => {
  const gated = {
    thing: {
      what: 'x',
      baselineMs: 1,
      budgetMs: 100,
      targetMs: 100,
      heapBaselineBytes: 1_000_000,
      heapBudgetBytes: 3_000_000
    }
  };
  const measurement = { name: 'thing', what: 'x', ms: 1, heapBytes: 4_000_000, detail: 'x' };

  expect(breaches([measurement], gated)).toHaveLength(1);
  expect(breaches([{ ...measurement, heapBytes: 2_000_000 }], gated)).toEqual([]);

  // On the web the same delta swung 8x between two runs of one fixture, so
  // nothing here is gated on it - it is recorded and printed instead.
  expect(Object.values(budgets.measurements).every((b) => b.heapBudgetBytes === null)).toBe(true);
});
