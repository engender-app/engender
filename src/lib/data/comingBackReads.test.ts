import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readReturnGap, readWhatIsWaiting, type ComingBackAreas } from './comingBackReads.ts';
import { RETURN_GAP_DAYS } from './comingBack.ts';
import { startOfDayTimestamp } from './epochDay.ts';

const TODAY = 20000;

/** Areas that record what was asked of them. Anything the reader reaches
    that is not here is a TypeError and a failing test. */
function recordingAreas(lastWrite: number | null) {
  const asked: string[] = [];
  const windows: { fromEpochDay: number; toEpochDay: number }[] = [];
  const areas = {
    lastWrite: {
      getLastWrites: async () => {
        asked.push('lastWrite');
        return { entries: lastWrite };
      }
    },
    letters: {
      getLetters: async (limit: number) => {
        asked.push(`letters(${limit})`);
        return [];
      }
    },
    milestones: {
      getMilestones: async () => {
        asked.push('milestones');
        return [];
      }
    },
    eras: {
      getEras: async () => {
        asked.push('eras');
        return [];
      }
    },
    wearSessions: {
      getRunningSession: async () => {
        asked.push('wearSessions');
        return { id: 'w1', startTimestamp: startOfDayTimestamp(TODAY - 40), durationMs: null, note: null };
      }
    },
    doses: {
      getComparison: async (window: { fromEpochDay: number; toEpochDay: number }) => {
        asked.push('doses');
        windows.push(window);
        return { reason: 'noEpisode' as const };
      }
    }
  } as unknown as ComingBackAreas;
  return { areas, asked, windows };
}

test('a boot that is not a return costs one read, not six', async () => {
  const { areas, asked } = recordingAreas(TODAY - (RETURN_GAP_DAYS - 1));

  assert.equal(await readReturnGap(areas, TODAY), null);
  assert.deepEqual(asked, ['lastWrite']);
});

test('a journal nobody has written to costs one read too', async () => {
  const { areas, asked } = recordingAreas(null);

  assert.equal(await readReturnGap(areas, TODAY), null);
  assert.deepEqual(asked, ['lastWrite']);
});

test('a return reads the rest, and asks the schedule about the gap and not about today', async () => {
  const since = TODAY - 40;
  const { areas, asked, windows } = recordingAreas(since);

  assert.equal(await readReturnGap(areas, TODAY), since);
  const surface = await readWhatIsWaiting(areas, TODAY, since);

  assert.equal(surface?.sinceEpochDay, since);
  assert.deepEqual(asked.slice(0, 1), ['lastWrite']);
  assert.deepEqual(asked.slice(1).sort(), ['doses', 'eras', 'letters(60)', 'milestones', 'wearSessions']);
  assert.deepEqual(windows, [{ fromEpochDay: since + 1, toEpochDay: TODAY - 1 }]);
});

test('the gap it is handed is the gap it answers about, whatever the journal now says', async () => {
  /* What the screen depends on: a dose backfilled into the gap moves the
     newest write forward, and the surface has to go on being about the gap
     it opened with rather than re-deciding under the person's hands. */
  const since = TODAY - 40;
  const { areas, windows } = recordingAreas(TODAY - 2);

  const surface = await readWhatIsWaiting(areas, TODAY, since);

  assert.equal(surface?.sinceEpochDay, since);
  assert.deepEqual(windows, [{ fromEpochDay: since + 1, toEpochDay: TODAY - 1 }]);
});
