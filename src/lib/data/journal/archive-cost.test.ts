/* Functional audit ticket 30: a cost travels on each of the five records
   that carry one, an older archive restores with none, and hair removal's
   old text cost in an older archive is read by the same rule as the
   migration (cost.ts), so nothing typed is lost on a restore either. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal, type Journal } from './journal.ts';
import type { ArchiveJournal } from '../archive/payload.ts';
import { NO_COST, type Cost } from '../cost.ts';

const PLN: Cost = { amount: 250, currency: 'PLN', refunded: false };
const EUR: Cost = { amount: 80.5, currency: 'EUR', refunded: true };
const REFUND_ONLY: Cost = { amount: null, currency: null, refunded: true };

async function freshJournal() {
  const journal = openJournal(await migratedDb(), fakeFileStore());
  await journal.reconcileBuiltIns();
  return journal;
}

async function costedJournal() {
  const journal = await freshJournal();
  await journal.hairRemoval.upsertSession({ epochDay: 100, area: 'chin', method: 'laser', cost: PLN, note: 'second pass' });
  await journal.appointments.upsertAppointment({ epochDay: 101, procedureId: null, kind: 'endo', place: null, note: null, cost: EUR });
  await journal.appointments.upsertAppointment({ epochDay: null, procedureId: null, kind: 'clinic', place: null, note: null, cost: PLN });
  await journal.procedures.upsertProcedure({ name: 'FFS', cost: { amount: 12000, currency: 'EUR', refunded: false } });
  await journal.labs.upsertResult({ epochDay: 102, analyte: 'estradiol', value: 100, unit: 'pg/mL', cost: REFUND_ONLY });
  await journal.stock.upsertEntry({ drug: 'estradiol valerate', quantity: 5, unit: 'vials', recordedEpochDay: 103, cost: { amount: 49.99, currency: 'PLN', refunded: false } });
  return journal;
}

async function costsOf(journal: Journal) {
  return {
    hair: (await journal.hairRemoval.getSessions()).map((s) => [s.cost, s.note]),
    visits: (await journal.appointments.getAppointments()).map((a) => a.cost),
    waits: (await journal.appointments.getWaiting()).map((a) => a.cost),
    procedures: (await journal.procedures.getProcedures()).map((p) => p.cost),
    labs: (await journal.labs.getResults('estradiol')).map((l) => l.cost),
    stock: (await journal.stock.getEntries()).map((s) => s.cost)
  };
}

async function restored(journal: ArchiveJournal) {
  const target = await freshJournal();
  await target.archive.replace({ journal, files: (async function* () {})() });
  return target;
}

test('every cost travels and a Replace restores it', async () => {
  const source = await costedJournal();
  const snapshot = await source.archive.snapshot();
  assert.deepEqual(
    snapshot.journal.hairRemovalSessions.map(({ costAmount, costCurrency, costRefunded, note }) => [costAmount, costCurrency, costRefunded, note]),
    [[250, 'PLN', false, 'second pass']]
  );
  assert.equal('cost' in snapshot.journal.hairRemovalSessions[0], false, 'the old text cost no longer travels');
  assert.deepEqual(await costsOf(await restored(snapshot.journal)), await costsOf(source));
});

test('an archive written before ticket 30 restores every record with no cost', async () => {
  const snapshot = await (await costedJournal()).archive.snapshot();
  const older = structuredClone(snapshot.journal) as unknown as Record<string, Record<string, unknown>[]>;
  for (const section of ['hairRemovalSessions', 'appointments', 'procedures', 'labResults', 'medicationStock']) {
    for (const row of older[section]) {
      delete row.costAmount;
      delete row.costCurrency;
      delete row.costRefunded;
      if (section === 'hairRemovalSessions') {
        delete row.note;
        row.cost = '';
      }
    }
  }
  const target = await restored(older as unknown as ArchiveJournal);
  const costs = await costsOf(target);
  assert.deepEqual(costs.hair, [[NO_COST, null]]);
  for (const list of [costs.visits, costs.waits, costs.procedures, costs.labs, costs.stock]) {
    assert.deepEqual(list, [NO_COST]);
  }
});

test("an older archive's text cost is read by the migration's rule, and text that does not parse lands in the note", async () => {
  const snapshot = await (await costedJournal()).archive.snapshot();
  const older = structuredClone(snapshot.journal) as unknown as { hairRemovalSessions: Record<string, unknown>[] };
  const [session] = older.hairRemovalSessions;
  for (const field of ['costAmount', 'costCurrency', 'costRefunded', 'note']) delete session[field];
  older.hairRemovalSessions = [
    { ...session, id: 'parsed', cost: '€80,50' },
    { ...session, id: 'words', cost: 'covered by NFZ' }
  ];
  const target = await restored(older as unknown as ArchiveJournal);
  assert.deepEqual(
    (await target.hairRemoval.getSessions()).map((s) => [s.id, s.cost, s.note]),
    [
      ['parsed', { amount: 80.5, currency: 'EUR', refunded: false }, null],
      ['words', NO_COST, 'covered by NFZ']
    ]
  );
});

test('an archive row with a cost the app would refuse is refused as unreadable', async () => {
  const snapshot = await (await costedJournal()).archive.snapshot();
  for (const [section, patch] of [
    ['labResults', { costAmount: 10, costCurrency: null }],
    ['appointments', { costAmount: -1, costCurrency: 'PLN' }],
    ['procedures', { costAmount: 10, costCurrency: 'zł' }],
    ['medicationStock', { costAmount: null, costCurrency: 'PLN' }],
    ['hairRemovalSessions', { costRefunded: 1 }]
  ] as const) {
    const broken = structuredClone(snapshot.journal) as unknown as Record<string, Record<string, unknown>[]>;
    Object.assign(broken[section][0], patch);
    await assert.rejects(restored(broken as unknown as ArchiveJournal), /not readable/, section);
  }
});
