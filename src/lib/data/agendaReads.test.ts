/* The agenda's reads (phase 10 redesign ticket 04, ADR-0073): which windows
   reach which area, that the forward read is `dayAhead` and nothing else,
   and that a disguised screen asks the journal nothing at all. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readAgenda, type AgendaAreas } from './agendaReads.ts';
import { AGENDA_DAYS } from './agenda.ts';
import type { DayAheadMark } from './journal/dayAhead.ts';

const TODAY = 20000;

type Window = { fromEpochDay: number; toEpochDay: number };

/** Areas that record what was asked of them. Anything the reader reaches
    that is not here is a TypeError and a failing test. */
function recordingAreas(marks: DayAheadMark[] = []) {
  const asked: string[] = [];
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
    }
  } as unknown as AgendaAreas;
  return { areas, asked, dayAheadCalls, doseWindows };
}

test('the forward read is dayAhead, asked for today through today plus seven', async () => {
  const { areas, asked, dayAheadCalls } = recordingAreas([{ kind: 'appointment', epochDay: TODAY + 2 }]);

  const projection = await readAgenda(areas, TODAY, false);

  assert.equal(projection?.shown.length, 1);
  assert.equal(asked.filter((call) => call === 'dayAhead').length, 1);
  assert.deepEqual(dayAheadCalls, [
    { fromEpochDay: TODAY, toEpochDay: TODAY + AGENDA_DAYS, todayEpochDay: TODAY }
  ]);
});

test('the schedule is asked about the week behind, ending yesterday', async () => {
  const { areas, doseWindows } = recordingAreas();

  await readAgenda(areas, TODAY, false);

  assert.deepEqual(doseWindows, [{ fromEpochDay: TODAY - AGENDA_DAYS, toEpochDay: TODAY - 1 }]);
});

test('a disguised screen reads nothing at all', async () => {
  const { areas, asked } = recordingAreas([{ kind: 'appointment', epochDay: TODAY + 2 }]);

  assert.equal(await readAgenda(areas, TODAY, true), null);
  assert.deepEqual(asked, []);
});

test('both reads are issued before the first await, so a live query sees both', async () => {
  // What lets ticket 13 mount this in an unseeded `liveQuery`: dependencies
  // are discovered from the operations a closure calls, and a read sitting
  // past an earlier `await` is discovered a re-run late (WAITING_TABLES's
  // own reason for existing). Both of these are in flight in the same tick.
  const { areas, asked } = recordingAreas();
  const pending = readAgenda(areas, TODAY, false);
  assert.deepEqual(asked, ['dayAhead', 'doses']);
  await pending;
});
