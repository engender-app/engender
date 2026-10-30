/* Functional audit ticket 30: a cost on each record that costs money, and
   the one read that lists them for Look back (ticket 31). */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns } from './test-support.ts';
import { costTotalsByCurrency, NO_COST } from '../cost.ts';

const PLN = { amount: 250, currency: 'PLN', refunded: false };
const EUR_REFUNDED = { amount: 80.5, currency: 'EUR', refunded: true };

test('a hair-removal session keeps a cost and a note, and leaves the old text column empty', async () => {
  const { journal, db } = await journalWithBuiltIns();
  const id = await journal.hairRemoval.upsertSession({
    epochDay: 100, area: 'chin', method: 'laser', cost: PLN, note: '  numbing cream helped  '
  });
  let [session] = await journal.hairRemoval.getSessions();
  assert.deepEqual(session.cost, PLN);
  assert.equal(session.note, 'numbing cream helped');
  assert.equal((db.raw.prepare('SELECT cost FROM hair_removal_session').get() as { cost: unknown }).cost, null);

  await journal.hairRemoval.upsertSession({ id, epochDay: 100, area: 'chin', method: 'laser', note: ' ' });
  [session] = await journal.hairRemoval.getSessions();
  assert.deepEqual(session.cost, NO_COST);
  assert.equal(session.note, null);

  await assert.rejects(
    journal.hairRemoval.upsertSession({ epochDay: 100, area: 'chin', method: 'laser', cost: { amount: -5, currency: 'PLN', refunded: false } }),
    /invalid cost/
  );
});

test('an appointment and a wait carry a cost, and an edit that leaves it out clears it', async () => {
  const { journal } = await journalWithBuiltIns();
  const visit = await journal.appointments.upsertAppointment({
    epochDay: 20100, procedureId: null, kind: 'endo', place: null, note: null, cost: EUR_REFUNDED
  });
  await journal.appointments.upsertAppointment({
    epochDay: null, procedureId: null, kind: 'clinic', place: null, note: null, cost: { amount: 300, currency: 'pln', refunded: false }
  });
  assert.deepEqual((await journal.appointments.getAppointments())[0].cost, EUR_REFUNDED);
  assert.deepEqual((await journal.appointments.getWaiting())[0].cost, { amount: 300, currency: 'PLN', refunded: false });

  await journal.appointments.upsertAppointment({ id: visit, epochDay: 20100, procedureId: null, kind: 'endo', place: null, note: null });
  assert.deepEqual((await journal.appointments.getAppointments())[0].cost, NO_COST);
});

test('a procedure keeps its cost through an edit that does not mention it', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.procedures.upsertProcedure({ name: 'Vaginoplasty', cost: PLN });
  assert.deepEqual((await journal.procedures.getProcedures())[0].cost, PLN);

  await journal.procedures.upsertProcedure({ id, name: 'Vaginoplasty', archived: true });
  assert.deepEqual((await journal.procedures.getProcedures())[0].cost, PLN);

  await journal.procedures.upsertProcedure({ id, name: 'Vaginoplasty', cost: null });
  assert.deepEqual((await journal.procedures.getProcedures())[0].cost, NO_COST);
});

test('a lab result carries a cost, and a refund can stand without an amount', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.labs.upsertResult({ epochDay: 100, analyte: 'Estradiol', value: 150, unit: 'pg/mL', cost: PLN });
  assert.deepEqual((await journal.labs.getResults('Estradiol'))[0].cost, PLN);

  await journal.labs.upsertResult({ id, epochDay: 100, analyte: 'Estradiol', value: 150, unit: 'pg/mL', cost: { amount: null, currency: 'PLN', refunded: true } });
  assert.deepEqual((await journal.labs.getResults('Estradiol'))[0].cost, { amount: null, currency: null, refunded: true });
});

test('the stock row carries the cost of the supply held now, and a fresh count without one clears it', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.stock.upsertEntry({ drug: 'estradiol valerate', quantity: 10, unit: 'vials', recordedEpochDay: 100, cost: PLN });
  assert.deepEqual((await journal.stock.getEntries())[0].cost, PLN);

  await journal.stock.upsertEntry({ drug: 'estradiol valerate', quantity: 8, unit: 'vials', recordedEpochDay: 110 });
  assert.deepEqual((await journal.stock.getEntries())[0].cost, NO_COST);
});

test('getCosts lists every record with a cost, with its day, and totals stay per currency', async () => {
  const { journal } = await journalWithBuiltIns();
  const session = await journal.hairRemoval.upsertSession({ epochDay: 100, area: 'chin', method: 'laser', cost: PLN });
  await journal.hairRemoval.upsertSession({ epochDay: 101, area: 'chin', method: 'laser' });
  const visit = await journal.appointments.upsertAppointment({ epochDay: 102, procedureId: null, kind: null, place: null, note: null, cost: EUR_REFUNDED });
  const wait = await journal.appointments.upsertAppointment({ epochDay: null, procedureId: null, kind: null, place: null, note: null, cost: { amount: 0, currency: 'PLN', refunded: false } });
  const procedure = await journal.procedures.upsertProcedure({ name: 'FFS', surgeryEpochDay: 300, cost: { amount: 1000, currency: 'EUR', refunded: false } });
  const lab = await journal.labs.upsertResult({ epochDay: 103, analyte: 'Estradiol', value: 1, unit: 'pg/mL', cost: { amount: null, currency: null, refunded: true } });
  const stock = await journal.stock.upsertEntry({ drug: 'estradiol valerate', quantity: 1, unit: 'vials', recordedEpochDay: 104, cost: { amount: 49.99, currency: 'PLN', refunded: false } });

  const costs = await journal.costs.getCosts();
  assert.deepEqual(
    costs.map(({ source, id, epochDay }) => [source, id, epochDay]).sort(),
    [
      ['appointment', visit, 102],
      ['appointment', wait, null],
      ['hairRemoval', session, 100],
      ['lab', lab, 103],
      ['procedure', procedure, 300],
      ['stock', stock, 104]
    ].sort()
  );
  assert.deepEqual(costTotalsByCurrency(costs.map((record) => record.cost)), [
    { currency: 'EUR', total: 1080.5, refunded: 80.5, count: 2 },
    { currency: 'PLN', total: 299.99, refunded: 0, count: 3 }
  ]);
});
