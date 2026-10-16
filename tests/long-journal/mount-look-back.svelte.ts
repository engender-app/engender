import { mount, unmount, tick } from 'svelte';
import LookBack from '../../src/routes/stats/+page.svelte';
import type { Journal } from '../../src/lib/data/journal/journal';
import type { RecordingDriver } from '../../src/lib/data/sqlite/test-support/recording-driver';
import { setLastLookBackSpan } from '../../src/lib/data/lookBackSpan';
import { prepareScreenJournal } from '../browser-tier/screen-journal';
import { setLookBackDay } from './today-stub';
import { assertLookBackWordsRead } from './look-back-ownership';
import type { installWorkerReadRecorder } from './worker-reads';

/** Attach and hydrate before the cold read window, as Home's mount does. */
export async function prepareMountedLookBack(
  journal: Journal,
  today: number,
  recorder: RecordingDriver,
  workerReads?: ReturnType<typeof installWorkerReadRecorder>
): Promise<() => Promise<{ result: number; detail: string; crossings?: { statements: number; bytes: number } }>> {
  const noteEntries = journal.entries.noteEntries;
  let calls = 0;
  let rows = 0;
  journal.entries.noteEntries = async () => {
    calls++;
    const notes = await noteEntries();
    rows += notes.length;
    return notes;
  };
  try {
    await prepareScreenJournal(journal);
    await recorder.driver.readSnapshot(async () => {});
  } catch (error) {
    journal.entries.noteEntries = noteEntries;
    throw error;
  }
  return async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    setLookBackDay(today);
    setLastLookBackSpan(null);
    const operation = async () => {
      const screen = mount(LookBack, { target });
      try {
        await tick();
        const started = performance.now();
        const ready = () => target.querySelector('[data-lookback-rail]') &&
          target.querySelector('[data-lookback-facts]') &&
          target.querySelector('[data-lookback-readings]') &&
          !target.querySelector('.read-group-members.is-held, [data-read-reserve-hold]');
        while (!ready()) {
          if (performance.now() - started > 20_000) throw new Error('Mounted Look back did not finish its reads');
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
        await tick();
        assertLookBackWordsRead(calls, rows);
        return { result: target.querySelectorAll('*').length,
          detail: `Real Look back mounted at fixture day ${today}; Words read ${rows} notes once; all read groups released` };
      } finally {
        await unmount(screen);
      }
    };
    try {
      if (!workerReads) return await operation();
      const { result, crossings } = await workerReads.record(operation);
      if (crossings.duplicates) throw new Error(`Mounted Look back sent ${crossings.duplicates} duplicate SQL statements`);
      return { ...result, crossings };
    } finally {
      journal.entries.noteEntries = noteEntries;
      setLookBackDay(null);
      setLastLookBackSpan(null);
      target.remove();
    }
  };
}
