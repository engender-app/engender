/* The appointment record (phase 8 features ticket 57, ADR-0066). What is
   asked here is that one record covers both cases - a consult that names a
   procedure and an appointment that stands on its own - that the delete
   contract holds (ADR-0053), that the kind suggestions come off this
   journal's own rows and nothing else, and that a procedure still shows its
   consults after the rename. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns } from './test-support.ts';
import { soonestFutureAppointment, mostRecentPastAppointment } from './appointments.ts';
import type { Appointment } from '../types.ts';

test('an appointment carries a day, a kind, a place and a note, and edits', async () => {
  const { journal } = await journalWithBuiltIns();

  const id = await journal.appointments.upsertAppointment({
    epochDay: 20100,
    procedureId: null,
    kind: 'endokrynolog',
    place: 'Poradnia, ul. Kopernika',
    note: 'ask about the dose'
  });

  assert.deepEqual(await journal.appointments.getAppointments(), [
    {
      id,
      epochDay: 20100,
      procedureId: null,
      kind: 'endokrynolog',
      place: 'Poradnia, ul. Kopernika',
      note: 'ask about the dose'
    }
  ]);

  await journal.appointments.upsertAppointment({
    id,
    epochDay: 20101,
    procedureId: null,
    kind: 'endokrynolog',
    place: null,
    note: null
  });

  const [edited] = await journal.appointments.getAppointments();
  assert.equal(edited.id, id);
  assert.equal(edited.epochDay, 20101);
  assert.equal(edited.place, null);
  assert.equal(edited.note, null);
});

test('everything but the day may be left out', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.appointments.upsertAppointment({
    epochDay: 20100,
    procedureId: null,
    kind: null,
    place: null,
    note: null
  });
  const [only] = await journal.appointments.getAppointments();
  assert.deepEqual(only, { id, epochDay: 20100, procedureId: null, kind: null, place: null, note: null });
});

test('appointments come back oldest first', async () => {
  const { journal } = await journalWithBuiltIns();
  const blank = { procedureId: null, kind: null, place: null, note: null };
  await journal.appointments.upsertAppointment({ ...blank, epochDay: 20200 });
  await journal.appointments.upsertAppointment({ ...blank, epochDay: 20000 });
  await journal.appointments.upsertAppointment({ ...blank, epochDay: 20100 });

  assert.deepEqual(
    (await journal.appointments.getAppointments()).map((a) => a.epochDay),
    [20000, 20100, 20200]
  );
});

test('an appointment can name the procedure it belongs to', async () => {
  const { journal } = await journalWithBuiltIns();
  const procedureId = await journal.procedures.upsertProcedure({ name: 'Vaginoplasty' });

  const id = await journal.appointments.upsertAppointment({
    epochDay: 20100,
    procedureId,
    kind: 'chirurg',
    place: null,
    note: null
  });

  const [linked] = await journal.appointments.getAppointments();
  assert.equal(linked.id, id);
  assert.equal(linked.procedureId, procedureId);
});

test('upserting against an unknown procedure throws and writes nothing', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(
    journal.appointments.upsertAppointment({
      epochDay: 20100,
      procedureId: 'no-such-procedure',
      kind: null,
      place: null,
      note: null
    })
  );
  assert.deepEqual(await journal.appointments.getAppointments(), []);
});

test('updating an unknown id throws, deleting one does not (ADR-0053)', async () => {
  const { journal } = await journalWithBuiltIns();

  await assert.rejects(
    journal.appointments.upsertAppointment({
      id: 'no-such-appointment',
      epochDay: 20100,
      procedureId: null,
      kind: null,
      place: null,
      note: null
    })
  );

  await journal.appointments.deleteAppointment('no-such-appointment');
  assert.deepEqual(await journal.appointments.getAppointments(), []);
});

test('deleting an appointment removes it and leaves the rest', async () => {
  const { journal } = await journalWithBuiltIns();
  const blank = { procedureId: null, kind: null, place: null, note: null };
  const first = await journal.appointments.upsertAppointment({ ...blank, epochDay: 20000 });
  await journal.appointments.upsertAppointment({ ...blank, epochDay: 20100 });

  await journal.appointments.deleteAppointment(first);
  assert.deepEqual(
    (await journal.appointments.getAppointments()).map((a) => a.epochDay),
    [20100]
  );
});

test('the kind suggestions are this journal\'s own kinds, most used first', async () => {
  const { journal } = await journalWithBuiltIns();
  const blank = { procedureId: null, place: null, note: null };

  // Nothing ships, so an empty journal offers nothing (ADR-0066).
  assert.deepEqual(await journal.appointments.getKinds(), []);

  await journal.appointments.upsertAppointment({ ...blank, epochDay: 20000, kind: 'psycholog' });
  await journal.appointments.upsertAppointment({ ...blank, epochDay: 20010, kind: 'endokrynolog' });
  await journal.appointments.upsertAppointment({ ...blank, epochDay: 20020, kind: 'endokrynolog' });
  await journal.appointments.upsertAppointment({ ...blank, epochDay: 20030, kind: null });
  await journal.appointments.upsertAppointment({ ...blank, epochDay: 20040, kind: '   ' });

  assert.deepEqual(await journal.appointments.getKinds(), ['endokrynolog', 'psycholog']);
});

test('a procedure still shows its consults, and only its own', async () => {
  const { journal } = await journalWithBuiltIns();
  const mine = await journal.procedures.upsertProcedure({ name: 'Vaginoplasty' });
  const other = await journal.procedures.upsertProcedure({ name: 'FFS' });

  const consult = await journal.procedures.addConsult(mine, 20000);
  await journal.procedures.addConsult(other, 20010);
  await journal.appointments.upsertAppointment({
    epochDay: 20020,
    procedureId: null,
    kind: null,
    place: null,
    note: null
  });

  const procedures = await journal.procedures.getProcedures();
  const found = procedures.find((p) => p.id === mine);
  assert.deepEqual(found?.consults, [{ id: consult, epochDay: 20000 }]);
});

test('an appointment written on the appointments screen shows on its procedure', async () => {
  const { journal } = await journalWithBuiltIns();
  const procedureId = await journal.procedures.upsertProcedure({ name: 'Vaginoplasty' });

  const id = await journal.appointments.upsertAppointment({
    epochDay: 20100,
    procedureId,
    kind: 'chirurg',
    place: null,
    note: null
  });

  const [procedure] = await journal.procedures.getProcedures();
  assert.deepEqual(procedure.consults, [{ id, epochDay: 20100 }]);
});

test('deleting a procedure takes its appointments and leaves the standalone ones', async () => {
  const { journal } = await journalWithBuiltIns();
  const procedureId = await journal.procedures.upsertProcedure({ name: 'Vaginoplasty' });
  await journal.procedures.addConsult(procedureId, 20000);
  const standalone = await journal.appointments.upsertAppointment({
    epochDay: 20010,
    procedureId: null,
    kind: null,
    place: null,
    note: null
  });

  await journal.procedures.deleteProcedure(procedureId);
  assert.deepEqual(
    (await journal.appointments.getAppointments()).map((a) => a.id),
    [standalone]
  );
});

test('the day view and the last write read appointments, linked or not', async () => {
  const { journal } = await journalWithBuiltIns();
  const procedureId = await journal.procedures.upsertProcedure({ name: 'Vaginoplasty' });
  await journal.procedures.addConsult(procedureId, 20000);
  await journal.appointments.upsertAppointment({
    epochDay: 20005,
    procedureId: null,
    kind: 'endokrynolog',
    place: null,
    note: null
  });

  const onDay = await journal.appointments.getDayRecords(20005);
  assert.equal(onDay.length, 1);
  assert.equal(onDay[0].kind, 'endokrynolog');
  assert.equal(onDay[0].procedureName, null);

  const withProcedure = await journal.appointments.getDayRecords(20000);
  assert.equal(withProcedure.length, 1);
  assert.equal(withProcedure[0].procedureName, 'Vaginoplasty');

  assert.equal(await journal.appointments.lastWriteEpochDay(20100), 20005);
  // A day still ahead is not a write that happened.
  assert.equal(await journal.appointments.lastWriteEpochDay(20002), 20000);
});

test('getAppointment reads one row by id, or undefined for an unknown one', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.appointments.upsertAppointment({
    epochDay: 20100,
    procedureId: null,
    kind: 'endokrynolog',
    place: null,
    note: null
  });

  assert.deepEqual(await journal.appointments.getAppointment(id), {
    id,
    epochDay: 20100,
    procedureId: null,
    kind: 'endokrynolog',
    place: null,
    note: null
  });
  assert.equal(await journal.appointments.getAppointment('no-such-appointment'), undefined);
});

/* soonestFutureAppointment and mostRecentPastAppointment (ticket 58): pure
   selectors over an already-fetched, oldest-first list (getAppointments's
   own order), the same shape liveTiles.ts's shouldShow* functions take -
   already-fetched rows plus today, no clock of their own. Today itself
   never appears in either list: the prep screen's own comment says an
   appointment later today is not past yet, and the debrief's existing
   "strictly past" condition is what this extends. */
const blank = { procedureId: null, kind: null, place: null, note: null };
const at = (epochDay: number, id: string): Appointment => ({ ...blank, id, epochDay });

test('soonestFutureAppointment picks the earliest day at or after today, or null', () => {
  const today = 20100;
  assert.equal(soonestFutureAppointment([], today), null);
  assert.equal(
    soonestFutureAppointment([at(20000, 'past'), at(20050, 'also-past')], today),
    null
  );
  assert.deepEqual(
    soonestFutureAppointment([at(20000, 'past'), at(20100, 'today'), at(20200, 'later'), at(20150, 'sooner')], today),
    at(20100, 'today')
  );
});

test('mostRecentPastAppointment picks the latest day strictly before today, or null', () => {
  const today = 20100;
  assert.equal(mostRecentPastAppointment([], today), null);
  assert.equal(mostRecentPastAppointment([at(20100, 'today'), at(20200, 'later')], today), null);
  assert.deepEqual(
    mostRecentPastAppointment([at(20000, 'oldest'), at(20050, 'middle'), at(20099, 'yesterday')], today),
    at(20099, 'yesterday')
  );
});
