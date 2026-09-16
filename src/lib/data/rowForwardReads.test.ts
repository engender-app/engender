/* The forward read (phase 11 all-four-doors ticket 02): that every area is
   asked exactly once through its own method, that the dose slot comes off
   `dayAhead` and nothing else, and the two reductions this file makes on the
   way to the projection - which dose slot is next, and which run-out day is
   soonest.

   What each fact turns into is `rowForward.test.ts`'s question. This is
   about what gets asked and what is handed on. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readRowForward, type RowForwardAreas } from './rowForwardReads.ts';
import { SPINE_FORWARD_DAYS } from './careSpine.ts';
import type { DayAheadMark } from './journal/dayAhead.ts';

const TODAY = 20000;

interface Held {
  marks?: DayAheadMark[];
  runOutDays?: (number | null)[];
  unlockDays?: number[];
}

/** Areas that record what was asked of them. Anything the reader reaches
    that is not here is a TypeError and a failing test - the discipline
    `agendaReads.test.ts` holds next door. */
function recordingAreas(held: Held = {}) {
  const asked: string[] = [];
  const dayAheadCalls: { fromEpochDay: number; toEpochDay: number; todayEpochDay: number }[] = [];
  const sealPages: number[] = [];

  const note =
    <T>(name: string, value: T) =>
    async () => {
      asked.push(name);
      return value;
    };

  const areas = {
    milestones: { getMilestones: note('milestones', []) },
    letters: {
      getLetterSeals: async (limit: number) => {
        asked.push('letters');
        sealPages.push(limit);
        return (held.unlockDays ?? []).map((unlockEpochDay, index) => ({
          id: `le-${index}`,
          epochDay: TODAY - 100,
          unlockEpochDay
        }));
      }
    },
    wearSessions: { getRunningSession: note('wearSessions', null) },
    tryouts: { getTryouts: note('tryouts', []) },
    appointments: { getAppointments: note('appointments', []) },
    procedures: { getProcedures: note('procedures', []) },
    dayAhead: {
      getDayAhead: async (fromEpochDay: number, toEpochDay: number, todayEpochDay: number) => {
        asked.push('dayAhead');
        dayAheadCalls.push({ fromEpochDay, toEpochDay, todayEpochDay });
        return held.marks ?? [];
      }
    },
    stock: {
      getProjections: async () => {
        asked.push('stock');
        return (held.runOutDays ?? []).map((runOutEpochDay) => ({
          entry: { drug: 'estradiol' },
          projection: { runOutEpochDay },
          reorderByEpochDay: null
        }));
      }
    },
    measurements: { latestMeasurement: note('measurements', null) }
  } as unknown as RowForwardAreas;

  return { areas, asked, dayAheadCalls, sealPages };
}

test('every area is asked once, through its own method', async () => {
  const { areas, asked } = recordingAreas();

  await readRowForward(areas, TODAY);

  assert.deepEqual([...asked].sort(), [
    'appointments',
    'dayAhead',
    'letters',
    'measurements',
    'milestones',
    'procedures',
    'stock',
    'tryouts',
    'wearSessions'
  ]);
  assert.equal(asked.length, 9, 'nine reads, none of them twice');
});

/* The Care screen behind the row draws its rail over exactly this window, so
   a row announcing a dose the screen does not show would be the two
   surfaces disagreeing. */
test('the dose slot is read off dayAhead, over the care rail’s own reach', async () => {
  const { areas, dayAheadCalls } = recordingAreas();

  await readRowForward(areas, TODAY);

  assert.deepEqual(dayAheadCalls, [
    { fromEpochDay: TODAY, toEpochDay: TODAY + SPINE_FORWARD_DAYS, todayEpochDay: TODAY }
  ]);
});

test('the next dose is the soonest dose slot, not the soonest mark of any kind', async () => {
  const { areas } = recordingAreas({
    marks: [
      { kind: 'milestone', epochDay: TODAY + 1 },
      { kind: 'doseSlot', epochDay: TODAY + 3 },
      { kind: 'doseSlot', epochDay: TODAY + 10 }
    ]
  });

  const map = await readRowForward(areas, TODAY);

  assert.deepEqual(map.care, { kind: 'next', epochDay: TODAY + 3, what: { area: 'dose', runOutEpochDay: null } });
});

/* A mark of another kind is the agenda's business, never a row's: the
   milestone above is drawn by the milestones row off the record that names
   it, and `dayAhead` is asked here for the one fact that needs no name. */
test('no row is built from a mark other than the dose slot', async () => {
  const { areas } = recordingAreas({
    marks: [
      { kind: 'milestone', epochDay: TODAY + 1 },
      { kind: 'appointment', epochDay: TODAY + 2 },
      { kind: 'letterUnlock', epochDay: TODAY + 3 },
      { kind: 'surgery', epochDay: TODAY + 4 }
    ]
  });

  const map = await readRowForward(areas, TODAY);

  assert.deepEqual(map, {});
});

test('the run-out is the soonest across every tracked drug', async () => {
  const { areas } = recordingAreas({ runOutDays: [TODAY + 40, TODAY + 19, TODAY + 90] });

  const map = await readRowForward(areas, TODAY);

  assert.deepEqual(map.care, { kind: 'next', epochDay: TODAY + 19, what: { area: 'runOut' } });
});

/* `stockProjection.ts` returns null for a stock with no rate to project
   from - nothing consumed in the window, so at this pace it never runs out.
   A row saying nothing about it is the honest answer rather than a guess. */
test('a stock with no projected run-out contributes none', async () => {
  const { areas } = recordingAreas({ runOutDays: [null, null] });

  const map = await readRowForward(areas, TODAY);

  assert.equal(map.care, undefined);
});

test('a run-out day already behind today is not a forward fact', async () => {
  const { areas } = recordingAreas({ runOutDays: [TODAY - 5] });

  const map = await readRowForward(areas, TODAY);

  assert.equal(map.care, undefined);
});

test('a letter already open drops out on its day rather than on a flag', async () => {
  const { areas } = recordingAreas({ unlockDays: [TODAY - 5, TODAY + 42] });

  const map = await readRowForward(areas, TODAY);

  assert.deepEqual(map.letters, { kind: 'next', epochDay: TODAY + 42, what: { area: 'letter', several: false } });
});

test('the seals are asked for as one page, not one letter at a time', async () => {
  const { areas, sealPages } = recordingAreas({ unlockDays: [TODAY + 1] });

  await readRowForward(areas, TODAY);

  assert.equal(sealPages.length, 1);
  assert.equal(sealPages[0] > 1, true);
});
