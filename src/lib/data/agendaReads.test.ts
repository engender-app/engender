/* The agenda's reads (ADR-0074): which windows
   reach which area, that the forward read is `dayAhead` and nothing else,
   and that both reads start before the first await. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readAgenda as readFacts, projectAgenda, type AgendaAreas } from './agendaReads.ts';
import { AGENDA_DAYS, AGENDA_PASSED_DAYS } from './agenda.ts';
import type { DayAheadMark } from './journal/dayAhead.ts';
import type { AppointmentDayRecord } from './journal/appointments.ts';

async function readAgenda(areas: AgendaAreas, today: number, covered = false) {
  return projectAgenda(await readFacts(areas, today), covered);
}

const TODAY = 20000;

type Window = { fromEpochDay: number; toEpochDay: number };

/** Areas that record what was asked of them. Anything the reader reaches
    that is not here is a TypeError and a failing test. */
function recordingAreas(marks: DayAheadMark[] = [], todayAppointments: AppointmentDayRecord[] = []) {
  const asked: string[] = [];
  const appointmentDays: number[] = [];
  const dayAheadCalls: (Window & { todayEpochDay: number })[] = [];
  const doseWindows: Window[] = [];
  const areas = {
    dayAhead: {
      getDayAhead: async (fromEpochDay: number, toEpochDay: number, todayEpochDay: number) => {
        asked.push('dayAhead');
        dayAheadCalls.push({ fromEpochDay, toEpochDay, todayEpochDay });
        return marks;
      }
    },
    doses: {
      getComparison: async (window: Window) => {
        asked.push('doses');
        doseWindows.push(window);
        return { reason: 'noEpisode' as const };
      }
    },
    appointments: {
      getDayRecords: async (epochDay: number) => {
        asked.push('appointments');
        appointmentDays.push(epochDay);
        return todayAppointments;
      }
    }
  } as unknown as AgendaAreas;
  return { areas, asked, dayAheadCalls, doseWindows, appointmentDays };
}

test('the forward read is dayAhead, asked for the thirty days from today', async () => {
  const { areas, asked, dayAheadCalls } = recordingAreas([{ kind: 'appointment', epochDay: TODAY + 2 }]);

  const projection = await readAgenda(areas, TODAY);

  assert.equal(projection?.shown.length, 1);
  assert.equal(asked.filter((call) => call === 'dayAhead').length, 1);
  assert.deepEqual(dayAheadCalls, [
    { fromEpochDay: TODAY, toEpochDay: TODAY + AGENDA_DAYS - 1, todayEpochDay: TODAY }
  ]);
});

test('every kind reaches the projection, and the cap folds the fourth', async () => {
  /* Functional-audit ticket 14 removed the per-kind switches, so all five
     kinds ADR-0067 admits are drawn and only the cap decides what folds. */
  const { areas } = recordingAreas([
    { kind: 'appointment', epochDay: TODAY + 1 },
    { kind: 'milestone', epochDay: TODAY + 2 },
    { kind: 'letterUnlock', epochDay: TODAY + 3 },
    { kind: 'surgery', epochDay: TODAY + 4 }
  ]);
  const projection = await readAgenda(areas, TODAY);
  assert.deepEqual(
    projection?.shown.map((item) => item.kind),
    ['appointment', 'milestone', 'letterUnlock']
  );
  assert.deepEqual(projection?.folded.map((item) => item.kind), ['surgery']);
});

/* Phase 11 ticket 03. Today draws a dose panel whenever a regimen is
   running, and that panel now carries the next slot's own day - so a
   doseSlot row in the band beside it is the same medication stated twice,
   which is the defect the ticket is named after. The flag the caller passes
   is whether the panel is drawn: since functional-audit ticket 15 the panel
   names every regimen the band could draw a row for (liveTiles.ts), and
   with the tile switched off the band keeps the kind, because otherwise a
   day some schedule expects would be on the screen nowhere at all. */
test('the dose kind is withheld while the panel accounts for every dose', async () => {
  const marks: DayAheadMark[] = [
    { kind: 'doseSlot', epochDay: TODAY + 6 },
    { kind: 'appointment', epochDay: TODAY + 12 }
  ];

  const withPanel = await readAgenda(recordingAreas(marks).areas, TODAY, true);
  assert.deepEqual(
    withPanel?.shown.map((item) => item.kind),
    ['appointment']
  );

  const withoutPanel = await readAgenda(recordingAreas(marks).areas, TODAY, false);
  assert.deepEqual(
    withoutPanel?.shown.map((item) => item.kind),
    ['doseSlot', 'appointment']
  );
});

test('a month whose only mark is a dose the panel states is absent, not empty', async () => {
  const marks: DayAheadMark[] = [{ kind: 'doseSlot', epochDay: TODAY + 6 }];
  assert.equal(await readAgenda(recordingAreas(marks).areas, TODAY, true), null);
});

test('the schedule is asked about the week behind, ending yesterday', async () => {
  const { areas, doseWindows } = recordingAreas();

  await readAgenda(areas, TODAY);

  assert.deepEqual(doseWindows, [{ fromEpochDay: TODAY - AGENDA_PASSED_DAYS, toEpochDay: TODAY - 1 }]);
});

test('every read is issued before the first await, so a live query sees all three', async () => {
  // What lets ticket 13 mount this in an unseeded `liveQuery`: dependencies
  // are discovered from the operations a closure calls, and a read sitting
  // past an earlier `await` is discovered a re-run late (WAITING_TABLES's
  // own reason for existing). All of these are in flight in the same tick.
  const { areas, asked } = recordingAreas();
  const pending = readAgenda(areas, TODAY);
  assert.deepEqual(asked, ['dayAhead', 'doses', 'appointments']);
  await pending;
});

/* Functional-audit ticket 14: the appointment-today tile is gone, and what
   it said - which appointment, and where - is the agenda's today row now.
   A mark is still a day and a kind (ADR-0067); only today's appointment row
   names the visit, because today is the one day the person needs the name
   and the place rather than the date. */
const endo: AppointmentDayRecord = {
  id: 'appt-1',
  kind: 'Endocrinologist',
  place: 'City clinic',
  procedureId: null,
  procedureName: null,
  event: 'visit',
  status: null,
  appointmentId: 'appt-1'
};

test("today's appointment row names the appointment and its place", async () => {
  const { areas, appointmentDays } = recordingAreas(
    [
      { kind: 'appointment', epochDay: TODAY },
      { kind: 'appointment', epochDay: TODAY + 5 }
    ],
    [endo]
  );
  const projection = await readAgenda(areas, TODAY);
  assert.deepEqual(appointmentDays, [TODAY]);
  assert.deepEqual(projection?.shown[0].appointment, { title: 'Endocrinologist', place: 'City clinic', more: 0, id: 'appt-1' });
  assert.equal(projection?.shown[1].appointment, undefined);
});

test("today's appointment row falls back to the procedure, then to no name", async () => {
  const marks: DayAheadMark[] = [{ kind: 'appointment', epochDay: TODAY }];
  const withProcedure = await readAgenda(
    recordingAreas(marks, [{ ...endo, kind: null, place: null, procedureName: 'Vaginoplasty' }]).areas,
    TODAY
  );
  assert.deepEqual(withProcedure?.shown[0].appointment, { title: 'Vaginoplasty', place: null, more: 0, id: 'appt-1' });
  const bare = await readAgenda(recordingAreas(marks, [{ ...endo, kind: null, place: null }]).areas, TODAY);
  assert.deepEqual(bare?.shown[0].appointment, { title: null, place: null, more: 0, id: 'appt-1' });
});

test("today's appointment row counts a second appointment on the same day", async () => {
  const { areas } = recordingAreas(
    [{ kind: 'appointment', epochDay: TODAY }],
    [endo, { ...endo, id: 'appt-2', kind: 'Psychologist', place: null }]
  );
  const projection = await readAgenda(areas, TODAY);
  assert.deepEqual(projection?.shown[0].appointment, { title: 'Endocrinologist', place: 'City clinic', more: 1, id: 'appt-1' });
});


/* FA 26 put a wait's referral day and its dated updates into the same day
   records. They are things that happened about an appointment, not a visit
   booked for today, so today's row names neither and counts neither. */
test("today's appointment row skips a referral and an update logged today", async () => {
  const marks: DayAheadMark[] = [{ kind: 'appointment', epochDay: TODAY }];
  const referred: AppointmentDayRecord = { ...endo, id: 'wait-1', kind: 'Gender clinic', event: 'referred' };
  const update: AppointmentDayRecord = { ...endo, id: 'wait-1', kind: 'Gender clinic', event: 'status', status: 'Letter came' };
  const withVisit = await readAgenda(recordingAreas(marks, [referred, update, endo]).areas, TODAY);
  assert.deepEqual(withVisit?.shown[0].appointment, { title: 'Endocrinologist', place: 'City clinic', more: 0, id: 'appt-1' });
  const withoutVisit = await readAgenda(recordingAreas(marks, [referred, update]).areas, TODAY);
  assert.equal(withoutVisit?.shown[0].appointment, undefined);
});

test('dose-panel coverage changes project the same facts without another read', async () => {
  const { areas, asked } = recordingAreas([
    { kind: 'doseSlot', epochDay: TODAY + 1 },
    { kind: 'appointment', epochDay: TODAY + 2 },
    { kind: 'milestone', epochDay: TODAY + 3 },
    { kind: 'letterUnlock', epochDay: TODAY + 4 }
  ]);
  const facts = await readFacts(areas, TODAY);
  assert.equal(projectAgenda(facts, false)?.folded.length, 1);
  const covered = projectAgenda(facts, true);
  assert.deepEqual(covered?.shown.map((row) => row.kind), ['appointment', 'milestone', 'letterUnlock']);
  assert.deepEqual(covered?.folded, []);
  assert.equal(projectAgenda(facts, false)?.shown[0].kind, 'doseSlot');
  assert.deepEqual(asked, ['dayAhead', 'doses', 'appointments']);
});

/* prh12: today's one appointment opens its own screen; two on the day
   leave the row on the list, since it names only the first. */
test("today's appointment row opens that appointment, or the list when the day holds two", async () => {
  const marks: DayAheadMark[] = [{ kind: 'appointment', epochDay: TODAY }, { kind: 'appointment', epochDay: TODAY + 3 }];
  const one = await readAgenda(recordingAreas(marks, [endo]).areas, TODAY);
  assert.equal(one?.shown[0].route, '/health/appointments/appt-1');
  assert.equal(one?.shown[1].route, '/health/appointments');
  const two = await readAgenda(recordingAreas(marks, [endo, { ...endo, id: 'appt-2', appointmentId: 'appt-2' }]).areas, TODAY);
  assert.equal(two?.shown[0].route, '/health/appointments');
});
