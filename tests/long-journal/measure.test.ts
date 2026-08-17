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

async function measureSmallJournal(): Promise<Measurement[]> {
  // The same file store the journal was opened with, which is what the
  // harness's caller hands it - the thumbnail reads have to reach the
  // bytes the generator wrote.
  const files = fakeFileStore();
  const journal = openJournal(await migratedDb(), files);
  await journal.reconcileBuiltIns();
  const summary = await generateLongJournal(journal, { seed: 11, days: 120, makePhoto: bytePatternPhoto });
  return measureLongJournal(journal, files, { today: summary.lastEpochDay, summary });
}

test('every measurement carries a name, a description, a time and a detail line', async () => {
  const measurements = await measureSmallJournal();

  expect(measurements.length).toBeGreaterThan(5);
  for (const m of measurements) {
    expect(m.name, 'a measurement with no name cannot be budgeted').toMatch(/^[a-z-]+$/);
    expect(m.what).not.toBe('');
    expect(m.ms).toBeGreaterThanOrEqual(0);
    expect(m.detail).not.toBe('');
    expect('heapBytes' in m).toBe(false);
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

test("archive-restore's phases account for the whole of it", async () => {
  const measurements = await measureSmallJournal();
  const at = (name: string): Measurement => {
    const found = measurements.find((m) => m.name === name);
    if (!found) throw new Error(`${name} is missing from the harness`);
    return found;
  };

  const total = at('archive-restore').ms;
  const files = at('archive-restore-files').ms;
  const db = at('archive-restore-db').ms;

  /* `db` is `total` minus `files`, so checking that they sum back to `total`
     would prove nothing. What is worth asserting is that the streaming window
     is real: it has to start and end inside the restore, and both halves have
     to have done some work. A `files` of zero or less is the failure that
     matters, because it means the generator's timestamp never landed and the
     whole breakdown would be attributing everything to the transaction. */
  expect(files).toBeGreaterThan(0);
  expect(files).toBeLessThan(total);
  expect(db).toBeGreaterThan(0);
  // And the read is inside the streaming window, not beside it.
  expect(at('archive-restore-read').ms).toBeLessThanOrEqual(files);
});

test('budgets.json covers exactly what the harness measures', async () => {
  const measured = (await measureSmallJournal()).map((m) => m.name).sort();
  expect(Object.keys(budgets.measurements).sort()).toEqual(measured);
});

test('budgets carry no heap fields', () => {
  for (const budget of Object.values(budgets.measurements)) {
    expect('heapBaselineBytes' in budget).toBe(false);
    expect('heapBudgetBytes' in budget).toBe(false);
  }
});

test('every budget leaves room above the baseline it was set from', () => {
  for (const [name, budget] of Object.entries(budgets.measurements)) {
    expect(budget.budgetMs, `${name} has no headroom over its baseline`).toBeGreaterThan(budget.baselineMs);
    expect(budget.targetMs, `${name} has no interaction target`).toBeGreaterThan(0);
  }
});

test('a measurement over budget is reported, and one under it is not', () => {
  const [name, budget] = Object.entries(budgets.measurements)[0];
  const under = { name, what: 'x', ms: budget.budgetMs - 1, detail: 'x' };
  const over = { ...under, ms: budget.budgetMs + 1 };

  expect(breaches([under])).toEqual([]);
  expect(breaches([over])).toHaveLength(1);
  expect(breaches([over])[0]).toContain(name);
});

test('a measurement with no budget entry is a breach, not a pass', () => {
  const stray = { name: 'not-budgeted', what: 'x', ms: 1, detail: 'x' };
  expect(breaches([stray])).toHaveLength(1);
});

test('a baseline past its target is reported, and one under it is not', () => {
  const table = {
    slow: { what: 'x', baselineMs: 900, budgetMs: 4500, targetMs: 250 },
    quick: { what: 'x', baselineMs: 9, budgetMs: 200, targetMs: 250 }
  };

  expect(overTarget(table)).toHaveLength(1);
  expect(overTarget(table)[0]).toContain('slow');
});
