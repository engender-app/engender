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
import { recordingDriver } from '../../src/lib/data/sqlite/test-support/recording-driver.ts';
import { generateLongJournal } from './generate.ts';
import { measureLongJournal, STARTUP_MEASUREMENT_NAMES, type Measurement } from './measure.ts';
import { budgets, breaches, budgetFor, mountBudgetsFor, overTarget } from './budgets.mjs';
import { bytePatternPhoto } from './test-support.ts';

async function measureSmallJournal(): Promise<Measurement[]> {
  // The same file store the journal was opened with, which is what the
  // harness's caller hands it - the thumbnail reads have to reach the
  // bytes the generator wrote.
  const files = fakeFileStore();
  const recorder = recordingDriver(await migratedDb());
  const journal = openJournal(recorder.driver, files);
  await journal.reconcileBuiltIns();
  const summary = await generateLongJournal(journal, { seed: 11, days: 120, makePhoto: bytePatternPhoto });
  return measureLongJournal(journal, files, { today: summary.lastEpochDay, summary, recorder });
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

/* --- the screen mounts (phase 8 audit ticket 01) ------------------------

   Four measurements are budgeted on what crossed the driver seam rather
   than on time. What this tier can check is that the counts arrive, that
   they are counts of something, and that the gate reads them; the numbers
   themselves are the browser tier's, on the decade fixture. */
const MOUNTS = ['mount-home', 'mount-stats', 'mount-more-hub', 'mount-coming-back'];

test('every screen mount is counted in statements and bytes, and nothing else is', async () => {
  const measurements = await measureSmallJournal();

  for (const name of MOUNTS) {
    const mount = measurements.find((m) => m.name === name);
    if (!mount) throw new Error(`${name} is missing from the harness`);
    expect(mount.statements, `${name} counted no statements`).toBeGreaterThan(0);
    expect(mount.bytes, `${name} counted no bytes`).toBeGreaterThan(0);
  }

  for (const m of measurements.filter((m) => !MOUNTS.includes(m.name))) {
    expect(m.statements, `${m.name} counts statements with no budget for them`).toBeUndefined();
    expect(m.bytes).toBeUndefined();
  }
});

test("Home's mount asks more of the journal than the hub's does", async () => {
  const measurements = await measureSmallJournal();
  const at = (name: string) => measurements.find((m) => m.name === name)!;

  /* Not a fact about the fixture: it is the finding the instrument was
     built for. Home fires twenty live queries to draw a grid of tiles and
     the hub fires three to draw eighteen rows, so if these two ever come
     back level, one of them is not being measured. */
  expect(at('mount-home').statements!).toBeGreaterThan(at('mount-more-hub').statements!);
  expect(at('mount-home').bytes!).toBeGreaterThan(at('mount-more-hub').bytes!);
});

test('every recorded mount budget is exactly the count rule', () => {
  for (const name of MOUNTS) {
    const budget = budgets.measurements[name];
    expect(budget.statementBaseline, `${name} has no recorded statement count`).toBeGreaterThan(0);
    expect(budget.byteBaseline).toBeGreaterThan(0);
    expect({ statementBudget: budget.statementBudget, byteBudget: budget.byteBudget }).toEqual(
      mountBudgetsFor(budget.statementBaseline!, budget.byteBaseline!)
    );
  }
});

test('a mount that fires one more statement or widens a read is a breach', () => {
  const name = MOUNTS[0];
  const budget = budgets.measurements[name];
  const within = {
    name,
    what: 'x',
    ms: 1,
    detail: 'x',
    statements: budget.statementBudget!,
    bytes: budget.byteBudget!
  };

  expect(breaches([within])).toEqual([]);
  expect(breaches([{ ...within, statements: within.statements + 1 }])[0]).toContain('statements over a budget');
  expect(breaches([{ ...within, bytes: within.bytes + 1 }])[0]).toContain('bytes over a budget');
});

test('a count with no budget, and a budget with no count, are both breaches', () => {
  const counted = { name: 'calendar-month', what: 'x', ms: 1, detail: 'x', statements: 3, bytes: 40 };
  expect(breaches([counted])).toHaveLength(2);
  expect(breaches([counted])[0]).toContain('statementBudget');

  const uncounted = { name: MOUNTS[0], what: 'x', ms: 1, detail: 'x' };
  expect(breaches([uncounted])).toHaveLength(2);
  expect(breaches([uncounted])[0]).toContain('took no statements count');
});

test('budgets.json covers exactly what the harness measures', async () => {
  /* The cold-start names come from the constant rather than from a run: the
     probe takes them around a real boot, which this tier has no driver for. */
  const measured = [...(await measureSmallJournal()).map((m) => m.name), ...STARTUP_MEASUREMENT_NAMES].sort();
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

test('every recorded budget is exactly min(max(5x baseline, 200ms floor), target)', () => {
  for (const budget of Object.values(budgets.measurements)) {
    expect(budget.budgetMs).toBe(budgetFor(budget.baselineMs, budget.targetMs));
  }
});

test('the target ceiling catches a regression the 200ms floor alone would miss', () => {
  // calendar-month's baseline (9ms) is tiny enough that 5x it never reaches
  // the 200ms floor, so the floor alone would let it regress all the way to
  // 200ms before CI noticed - twice its 100ms target. budgetFor() caps it at
  // the target instead.
  const budget = budgets.measurements['calendar-month'];
  expect(budget.budgetMs).toBeLessThan(200);
  expect(budget.budgetMs).toBe(budget.targetMs);

  const regressed = { name: 'calendar-month', what: 'x', ms: budget.budgetMs + 1, detail: 'x' };
  expect(breaches([regressed])).toHaveLength(1);
});

test('budgetFor leaves a measurement with no recorded target on the floor alone', () => {
  expect(budgetFor(1, null)).toBe(200);
  expect(budgetFor(900, null)).toBe(4500);
});
