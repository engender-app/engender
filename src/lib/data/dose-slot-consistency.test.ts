import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns } from './journal/test-support';
import { epochDayFromTimestamp, startOfDayTimestamp } from './epochDay';
import { readCare } from './careReads';
import { readRowForward } from './rowForwardReads';
import { readDoseLog } from './doseLogReads';
import { shouldShowPatchScheduleTile } from './liveTiles';

const TODAY = 20000;

for (const offset of [-3, -1, 0, 2, 3]) {
  test(`weekly patch dose on slot day ${offset >= 0 ? '+' : ''}${offset} covers the same slot across readers`, async () => {
    const { journal } = await journalWithBuiltIns();
    const id = await journal.regimen.upsertEpisode({ drug: 'estradiol', ester: null,
      dose: 100, doseUnit: 'mcg', route: 'patch', interval: 'weekly',
      startEpochDay: TODAY - 14, endEpochDay: null, endReason: null });
    await journal.doses.upsertSchedule({ episodeId: id, recurrence: { kind: 'everyNDays', everyNDays: 7 },
      dosesPerDay: 1, doseAmounts: null, autoLogFromEpochDay: null });
    const doseId = await journal.doses.upsertDose({ timestamp: startOfDayTimestamp(TODAY + offset) + 12 * 3600000,
      dose: 100, doseUnit: 'mcg', route: 'patch', applicationSite: 'abdomen' });
    const care = await readCare(journal, TODAY);
    assert.equal(care.lanes[0].nextDoseEpochDay, TODAY + 7);
    const row = await readRowForward(journal, TODAY, ['care']);
    assert.deepEqual(row.care, { kind: 'next', epochDay: TODAY + 7, what: { area: 'dose', runOutEpochDay: null } });
    const raw = await journal.dayAhead.getDayAhead(TODAY, TODAY + 7, TODAY, ['doseSlot']);
    assert.equal(raw[0].epochDay, TODAY, 'day-ahead still describes raw expectations');
    const log = await readDoseLog(journal, { today: TODAY, fromEpochDay: TODAY - 90,
      deepLinkedDoseId: null, regimenClaims: [] });
    assert.equal(log.scheduleView.reason, null);
    assert.equal(log.scheduleView.comparison.rows.find((row) => row.slot.epochDay === TODAY)?.dose?.id, doseId);
    assert.equal(log.scheduleView.comparison.unmatched.length, 0);
    assert.equal(log.logRows.some((row) => row.dose.id === doseId), offset <= 0, 'pairing input does not widen the visible log');
    const doses = await journal.doses.getDoses(TODAY - 3, TODAY + 3);
    assert.equal(shouldShowPatchScheduleTile({ episodes: log.episodes, schedules: await journal.doses.getSchedules(),
      doses, pauses: [], todayEpochDay: TODAY, enabled: true, snoozed: false }), null);
  });
}

const zoneCases: [string, string, number][] = [
  ['Europe/Warsaw', 'Europe/Warsaw', 1], ['Europe/Warsaw', 'America/Los_Angeles', 1],
  ['Europe/Warsaw', 'Asia/Tokyo', 1], ['Europe/Warsaw', 'Asia/Tokyo', 2],
  ['Europe/Warsaw', 'Pacific/Auckland', 1], ['Europe/Warsaw', 'Pacific/Kiritimati', 1],
  ['America/Los_Angeles', 'Europe/Warsaw', 1], ['America/Los_Angeles', 'Europe/Warsaw', 2]
];
for (const [fromZone, toZone, dosesPerDay] of zoneCases) {
  test(`auto-log keeps its slots after ${fromZone} to ${toZone}, ${dosesPerDay}/day`, async () => {
    const previous = process.env.TZ;
    try {
      process.env.TZ = fromZone;
      const from = epochDayFromTimestamp(new Date(2026, 10, 2, 12).getTime());
      const today = from + 7;
      const { journal } = await journalWithBuiltIns();
      const episodeId = await journal.regimen.upsertEpisode({ drug: 'estradiol', ester: null,
        dose: 2, doseUnit: 'mg', route: 'oral', interval: 'daily',
        startEpochDay: from, endEpochDay: null, endReason: null });
      await journal.doses.upsertSchedule({ episodeId, recurrence: { kind: 'everyNDays', everyNDays: 1 },
        dosesPerDay, doseAmounts: [{ dose: 2, doseUnit: 'mg' }], autoLogFromEpochDay: from });
      await journal.stock.upsertEntry({ drug: 'estradiol', quantity: 100, unit: 'tablets', recordedEpochDay: from - 1 });
      assert.equal(await journal.doses.autoLogDueDoses(today, []), 7 * dosesPerDay);
      const first = await journal.doses.getDoses(0, today + 2);
      process.env.TZ = toZone;
      const arrivalDay = epochDayFromTimestamp(first.at(-1)!.timestamp + 14 * 3600000);
      const legitimatelyNew = Math.max(0, arrivalDay - today) * dosesPerDay;
      assert.equal(legitimatelyNew, 0, 'none of the eight retained trips ends another schedule day');
      assert.equal(await journal.doses.autoLogDueDoses(arrivalDay, []), 0);
      const after = await journal.doses.getDoses(0, arrivalDay + 2);
      for (const dose of first) assert.deepEqual(after.find((row) => row.id === dose.id), dose);
      assert.equal(await journal.doses.autoLogDueDoses(arrivalDay, []), 0);
      const comparison = await journal.doses.getComparison({ fromEpochDay: from, toEpochDay: today - 1 });
      assert.equal(comparison.reason, null);
      assert.equal(comparison.comparison.rows.length, 7 * dosesPerDay);
      assert.ok(comparison.comparison.rows.every((row) => row.dose !== null));
      assert.deepEqual(comparison.comparison.unmatched, []);
      assert.equal((await journal.stock.getProjections(arrivalDay))[0].projection.remaining, 100 - after.length);
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
}

test('slot provenance cannot cover another episode or another position', async () => {
  const { journal } = await journalWithBuiltIns();
  const episodes = [];
  for (const drug of ['estradiol', 'progesterone']) {
    const episodeId = await journal.regimen.upsertEpisode({ drug, ester: null, dose: 2,
      doseUnit: 'mg', route: 'oral', interval: 'daily', startEpochDay: TODAY,
      endEpochDay: null, endReason: null });
    await journal.doses.upsertSchedule({ episodeId, recurrence: { kind: 'everyNDays', everyNDays: 1 },
      dosesPerDay: 2, doseAmounts: [{ dose: 2, doseUnit: 'mg' }], autoLogFromEpochDay: TODAY });
    episodes.push(episodeId);
  }
  await journal.doses.upsertDose({ route: 'oral', timestamp: startOfDayTimestamp(TODAY + 1),
    dose: 2, doseUnit: 'mg', drug: 'estradiol', source: 'schedule',
    autoLogSlot: { episodeId: episodes[0], epochDay: TODAY, indexInDay: 1 } });
  assert.equal(await journal.doses.autoLogDueDoses(TODAY + 1, []), 3);
  const all = await journal.doses.getDosesForSlots(TODAY, TODAY + 1);
  assert.equal(all.length, 4);
  assert.equal(new Set(all.map((dose) => JSON.stringify(dose.autoLogSlot))).size, 4);
  assert.equal(await journal.doses.autoLogDueDoses(TODAY + 2, []), 4, 'yesterday identity cannot cover any of the next day slots');
});

test('automatic provenance survives correction and Archives; old format-2 rows remain accepted', async () => {
  const { journal } = await journalWithBuiltIns();
  const episodeId = await journal.regimen.upsertEpisode({ drug: 'estradiol', ester: null,
    dose: 2, doseUnit: 'mg', route: 'oral', interval: 'daily', startEpochDay: TODAY - 1,
    endEpochDay: null, endReason: null });
  await journal.doses.upsertSchedule({ episodeId, recurrence: { kind: 'everyNDays', everyNDays: 1 },
    dosesPerDay: 1, doseAmounts: [{ dose: 2, doseUnit: 'mg' }], autoLogFromEpochDay: TODAY - 1 });
  assert.equal(await journal.doses.autoLogDueDoses(TODAY, []), 1);
  const [dose] = await journal.doses.getDoses(TODAY - 1, TODAY - 1);
  await journal.doses.upsertDose({ id: dose.id, timestamp: dose.timestamp, route: 'oral',
    dose: dose.dose, doseUnit: dose.doseUnit, drug: dose.drug, source: 'schedule', status: 'skipped' });
  const corrected = await journal.doses.getDoseById(dose.id);
  assert.deepEqual(corrected?.autoLogSlot, dose.autoLogSlot);
  assert.equal(await journal.doses.autoLogDueDoses(TODAY, []), 0);
  const snapshot = await journal.archive.snapshot();
  assert.equal(snapshot.journal.doseEvents[0].autoLogEpisodeId, episodeId);
  const replace = () => journal.archive.replace({ journal: snapshot.journal, fileCount: 0,
    files: (async function* () {})() });
  await replace();
  assert.deepEqual((await journal.doses.getDoseById(dose.id))?.autoLogSlot, dose.autoLogSlot);
  delete snapshot.journal.doseEvents[0].autoLogEpisodeId;
  delete snapshot.journal.doseEvents[0].autoLogEpochDay;
  delete snapshot.journal.doseEvents[0].autoLogIndex;
  await replace();
  assert.equal((await journal.doses.getDoseById(dose.id))?.autoLogSlot, undefined);
});

test('pauses and episode changes prevent early doses crossing ownership boundaries', async () => {
  const { journal } = await journalWithBuiltIns();
  const old = await journal.regimen.upsertEpisode({ drug: 'estradiol', ester: null, dose: 2,
    doseUnit: 'mg', route: 'oral', interval: 'weekly', startEpochDay: TODAY - 14,
    endEpochDay: TODAY - 1, endReason: 'switchedDrugOrRoute' });
  const current = await journal.regimen.upsertEpisode({ drug: 'estradiol', ester: null, dose: 2,
    doseUnit: 'mg', route: 'oral', interval: 'weekly', startEpochDay: TODAY,
    endEpochDay: TODAY + 6, endReason: 'pausedForNow' });
  for (const episodeId of [old, current]) await journal.doses.upsertSchedule({ episodeId,
    recurrence: { kind: 'everyNDays', everyNDays: 7 }, dosesPerDay: 1, doseAmounts: null, autoLogFromEpochDay: null });
  await journal.doses.upsertDose({ timestamp: startOfDayTimestamp(TODAY - 1), route: 'oral',
    dose: 2, doseUnit: 'mg' });
  assert.equal((await readCare(journal, TODAY)).lanes[0].nextDoseEpochDay, TODAY);
  await journal.doses.upsertPause({ episodeId: current, startEpochDay: TODAY,
    endEpochDay: TODAY, reason: 'planned' });
  assert.equal((await readCare(journal, TODAY)).lanes[0].nextDoseEpochDay, null, 'no slot exists after this episode ends');
});


test('zero-tolerance schedules keep yesterday separate from today across readers', async () => {
  const { journal } = await journalWithBuiltIns();
  const episodeId = await journal.regimen.upsertEpisode({ drug: 'estradiol', ester: null,
    dose: 2, doseUnit: 'mg', route: 'oral', interval: 'daily', startEpochDay: TODAY - 7,
    endEpochDay: null, endReason: null });
  await journal.doses.upsertSchedule({ episodeId, recurrence: { kind: 'everyNDays', everyNDays: 1 },
    dosesPerDay: 1, doseAmounts: null, autoLogFromEpochDay: null });
  await journal.doses.upsertDose({ timestamp: startOfDayTimestamp(TODAY - 1) + 12 * 3600000,
    route: 'oral', dose: 2, doseUnit: 'mg' });
  assert.deepEqual(await journal.doses.getDosesForSlots(TODAY, TODAY), []);
  assert.equal((await readCare(journal, TODAY)).lanes[0].nextDoseEpochDay, TODAY);
  assert.deepEqual((await readRowForward(journal, TODAY, ['care'])).care,
    { kind: 'next', epochDay: TODAY, what: { area: 'dose', runOutEpochDay: null } });
  const log = await readDoseLog(journal, { today: TODAY, fromEpochDay: TODAY - 7,
    deepLinkedDoseId: null, regimenClaims: [] });
  assert.equal(log.scheduleView.reason, null);
  assert.equal(log.scheduleView.comparison.rows.find((row) => row.slot.epochDay === TODAY)?.dose, null);
});

test('invalid partial or reused automatic provenance cannot alter stored doses', async () => {
  const { journal, db } = await journalWithBuiltIns();
  const input = { route: 'oral' as const, timestamp: startOfDayTimestamp(TODAY),
    dose: 2, doseUnit: 'mg', source: 'schedule' as const,
    autoLogSlot: { episodeId: 'standing-instruction', epochDay: TODAY, indexInDay: 0 } };
  const id = await journal.doses.upsertDose(input);
  await assert.rejects(() => journal.doses.upsertDose(input), /UNIQUE constraint/);
  await assert.rejects(() => db.run('UPDATE dose_event SET auto_log_epoch_day = NULL WHERE uuid = ?', [id]), /CHECK constraint/);
  await assert.rejects(() => db.run("UPDATE dose_event SET source = 'person' WHERE uuid = ?", [id]), /CHECK constraint/);
  assert.deepEqual((await journal.doses.getDosesForSlots(TODAY, TODAY)).map((dose) => dose.autoLogSlot), [input.autoLogSlot]);
});
