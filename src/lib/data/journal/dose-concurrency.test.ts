import { test, expect } from 'vitest';
import type { SqliteDriver } from '../sqlite/driver';
import { migratedDb } from '../sqlite/test-support/migrated-db';
import { fakeFileStore } from '../photos/test-support/fake-file-store';
import { openJournal } from '../journal/journal';
import { observeWrites } from '../live/writes';
import { journalIsBusy } from '../journal-busy';
import { startOfDayTimestamp } from '../epochDay';

function latch() {
  let release!: () => void;
  return { promise: new Promise<void>((resolve) => { release = resolve; }), release: () => release() };
}

async function setup() {
  const db = await migratedDb();
  const read = latch();
  const resume = latch();
  const driver: SqliteDriver = { ...db, async query<Row extends Record<string, unknown>>(sql: string, params?: unknown[]) {
    const rows = await db.query<Row>(sql, params);
    if (sql.includes('windows.day AS slot_day')) { read.release(); await resume.promise; }
    return rows;
  } };
  // Same public wrapper attachJournal returns to boot and installs for screens.
  const journal = observeWrites(openJournal(driver, fakeFileStore()), () => {});
  await journal.reconcileBuiltIns();
  const empty = await journal.archive.snapshot();
  const episodeId = await journal.regimen.upsertEpisode({
    drug: 'estradiol', ester: null, dose: 2, doseUnit: 'mg', route: 'oral',
    interval: 'daily', startEpochDay: 20000, endEpochDay: null, endReason: null
  });
  await journal.doses.upsertSchedule({ episodeId, recurrence: { kind: 'everyNDays', everyNDays: 1 },
    dosesPerDay: 1, doseAmounts: [{ dose: 2, doseUnit: 'mg' }], autoLogFromEpochDay: 20000 });
  return { db, journal, empty, read, resume, episodeId };
}

test('backfill respects a manual dose saved after its candidate read', async () => {
  const state = await setup();
  await state.journal.stock.upsertEntry({ drug: 'estradiol', quantity: 10, unit: 'tablets', recordedEpochDay: 20000 });
  const auto = state.journal.doses.autoLogDueDoses(20001, []);
  await state.read.promise;
  expect(journalIsBusy()).toBe(true);
  await state.journal.doses.upsertDose({ timestamp: startOfDayTimestamp(20000) + 12 * 3600000,
    route: 'oral', dose: 2, doseUnit: 'mg', drug: 'estradiol' });
  expect((await state.journal.stock.getProjections(20001))[0].projection.remaining).toBe(9);
  state.resume.release();
  expect(await auto).toBe(0);
  const doses = await state.journal.doses.getDoses(20000, 20001);
  expect(doses.map((dose) => dose.source).sort()).toEqual(['person']);
  expect((await state.journal.stock.getProjections(20001))[0].projection.remaining).toBe(9);
  expect(journalIsBusy()).toBe(false);
  await state.db.close();
});

test('backfill respects Replace completed after its candidate read', async () => {
  const state = await setup();
  const auto = state.journal.doses.autoLogDueDoses(20001, []);
  await state.read.promise;
  expect(journalIsBusy()).toBe(true);
  await state.journal.archive.replace({ journal: state.empty.journal, files: (async function* () {})() });
  state.resume.release();
  expect(await auto).toBe(0);
  expect(await state.journal.regimen.getEpisodes()).toEqual([]);
  expect(await state.journal.doses.getSchedules()).toEqual([]);
  const doses = await state.journal.doses.getDoses(20000, 20001);
  expect(doses).toHaveLength(0);
  expect(journalIsBusy()).toBe(false);
  await state.db.close();
});

test('concurrent backfills fill one slot once and retries stay idempotent', async () => {
  const state = await setup();
  const first = state.journal.doses.autoLogDueDoses(20001, []);
  const second = state.journal.doses.autoLogDueDoses(20001, []);
  await state.read.promise;
  state.resume.release();
  expect((await Promise.all([first, second])).sort()).toEqual([0, 1]);
  expect(await state.journal.doses.autoLogDueDoses(20001, [])).toBe(0);
  expect(await state.journal.doses.getDoses(20000, 20001)).toHaveLength(1);
  await state.db.close();
});

for (const change of ['schedule', 'episode', 'pause'] as const) {
  test(`backfill revalidates current ${change} after its candidate read`, async () => {
    const state = await setup();
    const auto = state.journal.doses.autoLogDueDoses(20001, []);
    await state.read.promise;
    if (change === 'schedule') {
      const [schedule] = await state.journal.doses.getSchedules();
      await state.journal.doses.upsertSchedule({ ...schedule, autoLogFromEpochDay: null });
    } else if (change === 'episode') {
      const [episode] = await state.journal.regimen.getEpisodes();
      await state.journal.regimen.upsertEpisode({ ...episode, startEpochDay: 20001 });
    } else await state.journal.doses.upsertPause({
      episodeId: state.episodeId, startEpochDay: 20000, endEpochDay: 20000, reason: 'planned'
    });
    state.resume.release();
    expect(await auto).toBe(0);
    expect(await state.journal.doses.getDoses(20000, 20001)).toEqual([]);
    await state.db.close();
  });
}
