/* The appointment record (phase 8 features ticket 57, ADR-0066). What is
   asked here is that one record covers both cases - a consult that names a
   procedure and an appointment that stands on its own - that the delete
   contract holds (ADR-0053), that the kind suggestions come off this
   journal's own rows and nothing else, and that a procedure still shows its
   consults after the rename. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns } from './test-support.ts';
import { soonestFutureAppointment, mostRecentPastAppointment, appointmentsOnDay, chosenAppointmentOnDay, waitingSince } from './appointments.ts';
import type { Appointment } from '../types.ts';
import { NO_COST } from '../cost.ts';

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
      note: 'ask about the dose',
      referredEpochDay: null,
      time: null,
      providerId: null,
      cost: NO_COST
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
  assert.deepEqual(only, { id, epochDay: 20100, procedureId: null, kind: null, place: null, note: null, referredEpochDay: null, time: null, providerId: null, cost: NO_COST });
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
    note: null,
    referredEpochDay: null,
    time: null,
    providerId: null,
    cost: NO_COST
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
const blank = { procedureId: null, kind: null, place: null, note: null, referredEpochDay: null, time: null, providerId: null, cost: NO_COST };
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

test('appointmentsOnDay reads the day whole, oldest first', () => {
  const today = 20100;
  assert.deepEqual(appointmentsOnDay([], today), []);
  assert.deepEqual(appointmentsOnDay([at(20099, 'yesterday'), at(20101, 'tomorrow')], today), []);
  assert.deepEqual(
    appointmentsOnDay([at(20099, 'yesterday'), at(20100, 'morning'), at(20100, 'afternoon'), at(20101, 'tomorrow')], today),
    [at(20100, 'morning'), at(20100, 'afternoon')]
  );
});

test('chosenAppointmentOnDay resolves the visit the room belongs to', () => {
  const today = 20100;
  // Nothing booked, on either side of the boundary: rehearsal, no visit.
  assert.equal(chosenAppointmentOnDay([], today, null), null);
  assert.equal(chosenAppointmentOnDay([at(20099, 'yesterday'), at(20101, 'tomorrow')], today, null), null);
  // One visit on the day: no choice step, the first-on-day fallback.
  assert.deepEqual(
    chosenAppointmentOnDay([at(20099, 'yesterday'), at(20100, 'today'), at(20200, 'later')], today, null),
    at(20100, 'today')
  );
  // A deleted or moved selection must not fall back to the remaining visit.
  assert.equal(
    chosenAppointmentOnDay([at(20100, 'today')], today, 'booked-elsewhere'),
    null
  );
  // Two on the day: the chosen one, whichever half of the day it is.
  assert.deepEqual(
    chosenAppointmentOnDay([at(20100, 'morning'), at(20100, 'afternoon')], today, 'afternoon'),
    at(20100, 'afternoon')
  );
  // Two on the day and nothing chosen: ambiguous, the screen must ask.
  assert.equal(chosenAppointmentOnDay([at(20100, 'morning'), at(20100, 'afternoon')], today, null), null);
  // The chosen one deleted from a day that still holds another: neither,
  // because falling back would attach this room to the other visit.
  assert.equal(chosenAppointmentOnDay([at(20100, 'morning'), at(20100, 'afternoon')], today, 'deleted'), null);
});

/* Waiting lists (functional-audit ticket 26). A referral is an appointment
   with no day yet: it carries the service (its kind), where (its place), the
   day it was referred on, dated status updates and notes, and is later given
   a day without becoming a different record. */

const referral = { procedureId: null, kind: 'Gender clinic', place: 'Charing Cross', note: 'GP letter sent' };

test('a referral is created without a day, waits, and is later given one', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.appointments.upsertAppointment({ ...referral, epochDay: null, referredEpochDay: 19000 });

  assert.deepEqual(await journal.appointments.getAppointments(), [], 'no day, so not a visit');
  assert.deepEqual(await journal.appointments.getWaiting(), [
    { id, epochDay: null, referredEpochDay: 19000, ...referral, time: null, providerId: null, cost: NO_COST }
  ]);
  assert.equal(await journal.appointments.getAppointment(id), undefined, 'the debrief link reads visits only');

  await journal.appointments.upsertAppointment({ ...referral, id, epochDay: 19400, referredEpochDay: 19000 });
  assert.deepEqual(await journal.appointments.getWaiting(), []);
  assert.deepEqual(await journal.appointments.getAppointments(), [
    { id, epochDay: 19400, referredEpochDay: 19000, ...referral, time: null, providerId: null, cost: NO_COST }
  ]);
});

test('waiting lists read longest wait first, an unknown referred-on day last', async () => {
  const { journal } = await journalWithBuiltIns();
  const unknown = await journal.appointments.upsertAppointment({ ...referral, epochDay: null, referredEpochDay: null });
  const recent = await journal.appointments.upsertAppointment({ ...referral, epochDay: null, referredEpochDay: 19500 });
  const oldest = await journal.appointments.upsertAppointment({ ...referral, epochDay: null, referredEpochDay: 18000 });
  assert.deepEqual((await journal.appointments.getWaiting()).map((a) => a.id), [oldest, recent, unknown]);
});

test('status updates are dated, read oldest first, refuse blank text and an unknown appointment, and go with it', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.appointments.upsertAppointment({ ...referral, epochDay: null, referredEpochDay: 19000 });
  const later = await journal.appointments.addStatusUpdate({ appointmentId: id, epochDay: 19200, status: '  Phoned, still on the list ' });
  const first = await journal.appointments.addStatusUpdate({ appointmentId: id, epochDay: 19050, status: 'Letter came' });

  assert.deepEqual(await journal.appointments.getStatusUpdates(), [
    { id: first, appointmentId: id, epochDay: 19050, status: 'Letter came' },
    { id: later, appointmentId: id, epochDay: 19200, status: 'Phoned, still on the list' }
  ]);

  await assert.rejects(journal.appointments.addStatusUpdate({ appointmentId: id, epochDay: 19300, status: '   ' }));
  await assert.rejects(journal.appointments.addStatusUpdate({ appointmentId: 'nope', epochDay: 19300, status: 'x' }));

  await journal.appointments.deleteStatusUpdate(first);
  await journal.appointments.deleteStatusUpdate(first);
  assert.deepEqual((await journal.appointments.getStatusUpdates()).map((s) => s.id), [later]);

  await journal.appointments.deleteAppointment(id);
  assert.deepEqual(await journal.appointments.getStatusUpdates(), []);
});

test('the day view shows a referral on its referred-on day and each status update on its own', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.appointments.upsertAppointment({ ...referral, epochDay: null, referredEpochDay: 19000 });
  const update = await journal.appointments.addStatusUpdate({ appointmentId: id, epochDay: 19050, status: 'Letter came' });

  assert.deepEqual(await journal.appointments.getDayRecords(19000), [
    { id, event: 'referred', status: null, kind: 'Gender clinic', place: 'Charing Cross', procedureId: null, procedureName: null }
  ]);
  assert.deepEqual(await journal.appointments.getDayRecords(19050), [
    { id: update, event: 'status', status: 'Letter came', kind: 'Gender clinic', place: 'Charing Cross', procedureId: null, procedureName: null }
  ]);

  await journal.appointments.upsertAppointment({ ...referral, id, epochDay: 19400, referredEpochDay: 19000 });
  assert.deepEqual((await journal.appointments.getDayRecords(19400)).map((r) => [r.id, r.event]), [[id, 'visit']]);
  assert.equal((await journal.appointments.getDayRecords(19000))[0].event, 'referred', 'the referral stays on its day');
});

test('a referral and its updates count as writes on their days; the waiting record never counts as a visit', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.appointments.upsertAppointment({ ...referral, epochDay: null, referredEpochDay: 19000 });
  assert.equal(await journal.appointments.lastWriteEpochDay(20000), 19000);
  await journal.appointments.addStatusUpdate({ appointmentId: id, epochDay: 19050, status: 'Letter came' });
  assert.equal(await journal.appointments.lastWriteEpochDay(20000), 19050);
  assert.equal(await journal.appointments.lastWriteEpochDay(19020), 19000);
});

test('a waiting referral linked to a procedure is not one of its consults until it has a day', async () => {
  const { journal } = await journalWithBuiltIns();
  const procedureId = await journal.procedures.upsertProcedure({ name: 'Top surgery' });
  await journal.appointments.upsertAppointment({ ...referral, procedureId, epochDay: null, referredEpochDay: 19000 });
  assert.equal((await journal.appointments.consultsByProcedure()).get(procedureId), undefined);
});

/* "Waiting since" is a fact, never a prediction (spec): elapsed time from
   the referred-on day to today, and nothing at all when that day is unknown
   or still ahead (a typo, not a wait). */
test('waitingSince is the elapsed calendar time and nothing else', () => {
  assert.deepEqual(waitingSince(19000, 19000), { years: 0, months: 0, days: 0 });
  assert.deepEqual(waitingSince(19000, 19045), { years: 0, months: 1, days: 14 });
  assert.equal(waitingSince(null, 19000), null);
  assert.equal(waitingSince(19001, 19000), null);
});

/* Functional-audit ticket 27: a time of day, and the person's own notes on
   who they see. */

test('an appointment keeps its time of day, and clearing it stores nothing', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.appointments.upsertAppointment({
    epochDay: 20100, time: '14:30', procedureId: null, kind: null, place: null, note: null
  });
  assert.equal((await journal.appointments.getAppointment(id))?.time, '14:30');

  await journal.appointments.upsertAppointment({ id, epochDay: 20100, time: '', procedureId: null, kind: null, place: null, note: null });
  assert.equal((await journal.appointments.getAppointment(id))?.time, null);
});

test('a time that is not HH:MM, or a time on a wait with no day, is refused before anything is written', async () => {
  const { journal } = await journalWithBuiltIns();
  for (const time of ['2:30', '24:00', '12:60', 'noon']) {
    await assert.rejects(
      journal.appointments.upsertAppointment({ epochDay: 20100, time, procedureId: null, kind: null, place: null, note: null })
    );
  }
  await assert.rejects(
    journal.appointments.upsertAppointment({ epochDay: null, time: '09:00', procedureId: null, kind: null, place: null, note: null })
  );
  assert.deepEqual(await journal.appointments.getAppointments(), []);
  assert.deepEqual(await journal.appointments.getWaiting(), []);
});

test('a provider is created, edited, attached to appointments, and deleting it leaves them standing', async () => {
  const { journal } = await journalWithBuiltIns();
  const provider = await journal.appointments.upsertProvider({
    name: '  Dr Nowak ', contact: '22 123 45 67', competence: 'good', impressions: 'listened'
  });
  assert.deepEqual(await journal.appointments.getProviders(), [
    { id: provider, name: 'Dr Nowak', contact: '22 123 45 67', competence: 'good', impressions: 'listened' }
  ]);

  await journal.appointments.upsertProvider({ id: provider, name: 'Dr Anna Nowak', contact: ' ', competence: null, impressions: null });
  assert.deepEqual(await journal.appointments.getProviders(), [
    { id: provider, name: 'Dr Anna Nowak', contact: null, competence: null, impressions: null }
  ]);

  const visit = await journal.appointments.upsertAppointment({
    epochDay: 20100, providerId: provider, procedureId: null, kind: null, place: null, note: null
  });
  const wait = await journal.appointments.upsertAppointment({
    epochDay: null, referredEpochDay: 20000, providerId: provider, procedureId: null, kind: null, place: null, note: null
  });
  assert.equal((await journal.appointments.getAppointment(visit))?.providerId, provider);
  assert.equal((await journal.appointments.getWaiting())[0].providerId, provider);

  await journal.appointments.deleteProvider(provider);
  assert.deepEqual(await journal.appointments.getProviders(), []);
  assert.equal((await journal.appointments.getAppointment(visit))?.providerId, null);
  assert.equal((await journal.appointments.getWaiting())[0].id, wait);
  assert.equal((await journal.appointments.getWaiting())[0].providerId, null);
});

test('a provider needs a name, an unknown competence reads as not said, and an unknown provider is refused', async () => {
  const { journal, db } = await journalWithBuiltIns();
  await assert.rejects(journal.appointments.upsertProvider({ name: '  ', contact: null, competence: null, impressions: null }));
  await assert.rejects(
    journal.appointments.upsertAppointment({ epochDay: 20100, providerId: 'nobody', procedureId: null, kind: null, place: null, note: null })
  );
  assert.deepEqual(await journal.appointments.getAppointments(), []);

  db.raw.exec(`INSERT INTO provider (uuid, name, competence, updated_at) VALUES ('p-old', 'Someone', 'stellar', 1)`);
  assert.equal((await journal.appointments.getProviders())[0].competence, null);
});

test('providers read by name, ignoring case', async () => {
  const { journal } = await journalWithBuiltIns();
  for (const name of ['zofia', 'Adam', 'beata']) {
    await journal.appointments.upsertProvider({ name, contact: null, competence: null, impressions: null });
  }
  assert.deepEqual((await journal.appointments.getProviders()).map((p) => p.name), ['Adam', 'beata', 'zofia']);
});
