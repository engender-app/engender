/* Functional audit ticket 20: what Taken and Skip on a fired medication
   reminder write into the journal once it is unlocked, and where tapping
   the notification itself lands. */

import { afterAll, test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns } from '../data/journal/test-support.ts';
import { epochDayFromTimestamp, timestampAtLocalTime } from '../data/epochDay.ts';
import type { Journal } from '../data/journal/journal.ts';
import { applyPendingDoseAction, resolveDoseReminderRoute, type PendingDoseAction } from './doseActions.ts';

const DAY = 20400;
const at = (day: number, time: string) => timestampAtLocalTime(day, time);

async function onRegimen(options: { schedule?: boolean; autoLogFrom?: number | null } = {}) {
  const { journal } = await journalWithBuiltIns();
  const episodeId = await journal.regimen.upsertEpisode({
    drug: 'Estradiol valerate',
    ester: null,
    dose: 2,
    doseUnit: 'mg',
    route: 'sublingual',
    interval: 'daily',
    startEpochDay: DAY - 30,
    endEpochDay: null,
    endReason: null
  });
  if (options.schedule !== false) {
    await journal.doses.upsertSchedule({
      episodeId,
      recurrence: { kind: 'everyNDays', everyNDays: 1 },
      dosesPerDay: 1,
      doseAmounts: [{ dose: 1.5, doseUnit: 'mg' }],
      autoLogFromEpochDay: options.autoLogFrom ?? null
    });
  }
  const reminderId = await journal.reminders.upsertReminder({
    title: 'Estradiol',
    time: '20:00',
    recurrence: 'DAILY',
    interval: null,
    anchorEpochDay: null,
    epochDay: null,
    enabled: true,
    drug: 'Estradiol valerate'
  });
  return { journal, episodeId, reminderId };
}

const action = (reminderId: string, kind: 'taken' | 'skipped', postedAt: number, tappedAt: number): PendingDoseAction => ({
  id: `a-${kind}-${tappedAt}`,
  reminderId,
  drug: 'Estradiol valerate',
  action: kind,
  postedAt,
  at: tappedAt
});

const dosesOn = (journal: Journal, day: number) => journal.doses.getDoses(day, day);

test('Taken logs the slot as taken, at the moment it was tapped, with the amount the schedule expects', async () => {
  const { journal, reminderId } = await onRegimen();
  const outcome = await applyPendingDoseAction(journal, action(reminderId, 'taken', at(DAY, '20:00'), at(DAY, '20:04')), []);
  assert.equal(outcome.result, 'logged');

  const [dose] = await dosesOn(journal, DAY);
  assert.deepEqual(
    { timestamp: dose.timestamp, status: dose.status, dose: dose.dose, unit: dose.doseUnit, route: dose.route, drug: dose.drug, source: dose.source },
    { timestamp: at(DAY, '20:04'), status: 'taken', dose: 1.5, unit: 'mg', route: 'sublingual', drug: 'Estradiol valerate', source: 'person' }
  );
  assert.equal(outcome.result === 'logged' && outcome.doseId, dose.id);
});

test('Skip marks the slot handled with a skipped dose, so the day reads as recorded rather than missed', async () => {
  const { journal, reminderId } = await onRegimen();
  await applyPendingDoseAction(journal, action(reminderId, 'skipped', at(DAY, '20:00'), at(DAY, '20:01')), []);

  const comparison = await journal.doses.getComparison({ fromEpochDay: DAY, toEpochDay: DAY, drug: 'Estradiol valerate' });
  assert.equal(comparison.reason, null);
  if (comparison.reason !== null) return;
  assert.deepEqual(comparison.comparison.rows.map((row) => row.dose?.status ?? null), ['skipped']);
});

test('an action that reaches a slot already logged writes nothing, so a replay after a lost acknowledgement is harmless', async () => {
  const { journal, reminderId } = await onRegimen();
  const tap = action(reminderId, 'taken', at(DAY, '20:00'), at(DAY, '20:04'));
  assert.equal((await applyPendingDoseAction(journal, tap, [])).result, 'logged');
  assert.equal((await applyPendingDoseAction(journal, tap, [])).result, 'already');
  assert.equal((await applyPendingDoseAction(journal, { ...tap, id: 'skip', action: 'skipped' }, [])).result, 'already');
  assert.equal((await dosesOn(journal, DAY)).length, 1);
});

test('a tap after midnight lands on the evening it was for, at that evening\'s reminder time', async () => {
  const { journal, reminderId } = await onRegimen();
  const outcome = await applyPendingDoseAction(journal, action(reminderId, 'taken', at(DAY, '20:00'), at(DAY + 1, '00:30')), []);
  assert.equal(outcome.result, 'logged');
  assert.equal(outcome.slotEpochDay, DAY);
  const [dose] = await dosesOn(journal, DAY);
  assert.equal(dose.timestamp, at(DAY, '20:00'));
  assert.deepEqual(await dosesOn(journal, DAY + 1), []);
});

test('an action applied days later, after the journal stayed locked, still fills the day it was posted for', async () => {
  const { journal, reminderId } = await onRegimen();
  const outcome = await applyPendingDoseAction(journal, action(reminderId, 'skipped', at(DAY - 3, '20:00'), at(DAY - 3, '20:10')), []);
  assert.equal(outcome.result, 'logged');
  assert.equal(epochDayFromTimestamp((await dosesOn(journal, DAY - 3))[0].timestamp), DAY - 3);
});

test('the rule the notification was posted under decides the slot, not a rule edited since', async () => {
  const { journal, reminderId } = await onRegimen();
  // Posted at 07:00 for a 07:00 rule, then the reminder was moved to 20:00 before the tap landed.
  await journal.reminders.upsertReminder({
    id: reminderId, title: 'Estradiol', time: '20:00', recurrence: 'DAILY', interval: null, anchorEpochDay: null,
    epochDay: null, enabled: true, drug: 'Estradiol valerate'
  });
  const posted = { time: '07:00', recurrence: 'DAILY' as const, interval: null, anchorEpochDay: null, epochDay: null };
  const outcome = await applyPendingDoseAction(
    journal, { ...action(reminderId, 'taken', at(DAY, '07:00'), at(DAY + 1, '06:00')), rule: posted }, []
  );
  assert.equal(outcome.slotEpochDay, DAY);
  assert.equal((await dosesOn(journal, DAY))[0]?.timestamp, at(DAY, '07:00'));
});

test('Skip over a dose the schedule logged on its own turns that dose into a skip', async () => {
  const { journal, reminderId } = await onRegimen({ autoLogFrom: DAY - 1 });
  assert.equal(await journal.doses.autoLogDueDoses(DAY, []), 1);
  const outcome = await applyPendingDoseAction(journal, action(reminderId, 'skipped', at(DAY - 1, '20:00'), at(DAY, '07:00')), []);
  assert.equal(outcome.result, 'logged');
  const doses = await dosesOn(journal, DAY - 1);
  assert.deepEqual(doses.map((dose) => [dose.status, dose.source]), [['skipped', 'schedule']]);
});

test('a regimen with no schedule still takes the dose: there is no slot to be full', async () => {
  const { journal, reminderId } = await onRegimen({ schedule: false });
  const outcome = await applyPendingDoseAction(journal, action(reminderId, 'taken', at(DAY, '20:00'), at(DAY, '20:02')), []);
  assert.equal(outcome.result, 'logged');
  assert.deepEqual((await dosesOn(journal, DAY)).map((dose) => [dose.dose, dose.doseUnit, dose.status]), [[2, 'mg', 'taken']]);
});

test('a drug with no running regimen writes nothing and says so', async () => {
  const { journal, reminderId } = await onRegimen();
  const outcome = await applyPendingDoseAction(
    journal, { ...action(reminderId, 'taken', at(DAY, '20:00'), at(DAY, '20:02')), drug: 'Spironolactone' }, []
  );
  assert.equal(outcome.result, 'noRegimen');
  assert.deepEqual(await dosesOn(journal, DAY), []);
});

test('two regimens running for the drug write nothing and say that, not that none is running', async () => {
  const { journal, reminderId } = await onRegimen();
  await journal.regimen.upsertEpisode({
    drug: 'Estradiol valerate',
    ester: null,
    dose: 4,
    doseUnit: 'mg',
    route: 'intramuscular',
    interval: 'weekly',
    startEpochDay: DAY - 3,
    endEpochDay: null,
    endReason: null
  });
  const outcome = await applyPendingDoseAction(journal, action(reminderId, 'taken', at(DAY, '20:00'), at(DAY, '20:02')), []);
  assert.equal(outcome.result, 'multipleRegimens');
  assert.deepEqual(await dosesOn(journal, DAY), []);
});

test('tapping the notification opens the dose log on that drug with the add form open', async () => {
  const { journal, episodeId, reminderId } = await onRegimen();
  assert.equal(
    await resolveDoseReminderRoute(`/care/doses?add=1&reminder=${reminderId}`, journal, at(DAY, '20:01')),
    `/care/doses?add=1&episode=${episodeId}`
  );
  // A reminder whose drug has no running regimen, or that has gone, still opens the add form.
  assert.equal(await resolveDoseReminderRoute('/care/doses?add=1&reminder=gone', journal, at(DAY, '20:01')), '/care/doses?add=1');
  // Every other route passes through untouched.
  assert.equal(await resolveDoseReminderRoute('/settings/reminders/abc', journal, at(DAY, '20:01')), '/settings/reminders/abc');
});

/* A notification rings in one zone and the journal opens in another (a flight
   in between, or a phone zone change). The tap answers the slot the person
   saw ring, the day the native side recorded, whatever zone applies it. */
const ringedIn = process.env.TZ;
afterAll(() => {
  if (ringedIn === undefined) delete process.env.TZ;
  else process.env.TZ = ringedIn;
});

const RING_DAY = 20775; // 2026-11-18, the calendar day in Warsaw when the reminder rang
const ZONES_AFTER_A_FLIGHT = ['America/Los_Angeles', 'UTC', 'Australia/Lord_Howe', 'Asia/Kolkata', 'Pacific/Chatham', 'Pacific/Kiritimati'];

for (const ring of ['09:00', '22:30']) {
  for (const zone of ZONES_AFTER_A_FLIGHT) {
    for (const yesterdayTaken of [false, true]) {
      test(`Taken after a zone change (${ring} Warsaw ring, applied in ${zone}, yesterday ${yesterdayTaken ? 'taken' : 'empty'}) lands on the ringing day, once`, async () => {
        process.env.TZ = zone;
        const { journal, reminderId } = await onRegimen();
        const [hour, minute] = ring.split(':').map(Number);
        const rang = Date.UTC(2026, 10, 18, hour - 1, minute); // Warsaw is UTC+1 in November
        if (yesterdayTaken) {
          await journal.doses.upsertDose({
            timestamp: at(RING_DAY - 1, ring), route: 'sublingual', dose: 2, doseUnit: 'mg', status: 'taken',
            drug: 'Estradiol valerate', source: 'person'
          });
        }
        const tap: PendingDoseAction = {
          ...action(reminderId, 'taken', rang, rang + 30e3),
          rule: { time: ring, recurrence: 'DAILY', interval: null, anchorEpochDay: null, epochDay: null },
          slotEpochDay: RING_DAY
        };
        const outcome = await applyPendingDoseAction(journal, tap, []);
        assert.equal(outcome.result, 'logged');
        assert.equal(outcome.slotEpochDay, RING_DAY);
        assert.equal((await dosesOn(journal, RING_DAY)).filter((d) => d.status === 'taken').length, 1);
        assert.equal((await applyPendingDoseAction(journal, tap, [])).result, 'already');
        assert.equal((await dosesOn(journal, RING_DAY)).filter((d) => d.status === 'taken').length, 1);
      });
    }
  }
}

test('a pending action written before the slot day was carried still applies by recomputing it', async () => {
  process.env.TZ = 'Europe/Warsaw';
  const { journal, reminderId } = await onRegimen();
  const posted = at(DAY, '20:00');
  const outcome = await applyPendingDoseAction(
    journal,
    { ...action(reminderId, 'taken', posted, posted + 4 * 60e3), rule: { time: '20:00', recurrence: 'DAILY', interval: null, anchorEpochDay: null, epochDay: null } },
    []
  );
  assert.equal(outcome.result, 'logged');
  assert.equal(outcome.slotEpochDay, DAY);
});
