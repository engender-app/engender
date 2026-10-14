/* The forward read (phase 11 all-four-doors ticket 02): that every area is
   asked exactly once through its own method, that the dose owner supplies
   the next uncovered slot, and that the soonest stock run-out is handed
   to the projection.

   What each fact turns into is `rowForward.test.ts`'s question. This is
   about what gets asked and what is handed on. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readRowForward, type RowForwardAreas } from './rowForwardReads.ts';
import { SPINE_FORWARD_DAYS } from './careSpine.ts';

const TODAY = 20000;

interface Held {
  nextDoseEpochDay?: number;
  runOutDays?: (number | null)[];
  unlockDays?: number[];
}

/** Areas that record what was asked of them. Anything the reader reaches
    that is not here is a TypeError and a failing test - the discipline
    `agendaReads.test.ts` holds next door. */
function recordingAreas(held: Held = {}) {
  const asked: string[] = [];
  const doseSlotCalls: { fromEpochDay: number; toEpochDay: number }[] = [];
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
    doses: {
      getNextUncoveredSlot: async (fromEpochDay: number, toEpochDay: number) => {
        asked.push('doses');
        doseSlotCalls.push({ fromEpochDay, toEpochDay });
        return held.nextDoseEpochDay === undefined ? null
          : { epochDay: held.nextDoseEpochDay, indexInDay: 0, amount: null };
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

  return { areas, asked, doseSlotCalls, sealPages };
}

test('every area is asked once, through its own method', async () => {
  const { areas, asked } = recordingAreas();

  await readRowForward(areas, TODAY);

  assert.deepEqual([...asked].sort(), [
    'appointments',
    'doses',
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
test('the uncovered dose slot is read from its owner, over the care rail’s own reach', async () => {
  const { areas, doseSlotCalls } = recordingAreas();

  await readRowForward(areas, TODAY);

  assert.deepEqual(doseSlotCalls, [
    { fromEpochDay: TODAY, toEpochDay: TODAY + SPINE_FORWARD_DAYS }
  ]);
});

test('the next dose is the uncovered slot supplied by its owner', async () => {
  const { areas } = recordingAreas({ nextDoseEpochDay: TODAY + 3 });
  const map = await readRowForward(areas, TODAY);
  assert.deepEqual(map.care, { kind: 'next', epochDay: TODAY + 3, what: { area: 'dose', runOutEpochDay: null } });
});

test('no uncovered slot and no projected run-out gives no care row', async () => {
  const { areas } = recordingAreas();
  assert.deepEqual(await readRowForward(areas, TODAY), {});
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

test('a pinned wear row reads no facts belonging to other rows', async () => {
  const { areas, asked } = recordingAreas();
  assert.deepEqual(await readRowForward(areas, TODAY, ['wear']), {});
  assert.deepEqual(asked, ['wearSessions']);
});

test('an empty pin selection reads nothing, while care keeps both dose and stock facts', async () => {
  const { areas, asked } = recordingAreas({
    nextDoseEpochDay: TODAY + 3, runOutDays: [TODAY + 10]
  });
  assert.deepEqual(await readRowForward(areas, TODAY, []), {});
  assert.deepEqual(asked, []);
  assert.deepEqual(await readRowForward(areas, TODAY, ['care']), {
    care: { kind: 'next', epochDay: TODAY + 3, what: { area: 'dose', runOutEpochDay: TODAY + 10 } }
  });
  assert.deepEqual(asked, ['doses', 'stock']);
});
