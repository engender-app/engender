import { mount, unmount, tick } from 'svelte';
import Host from './Host.svelte';
import '../../src/lib/theme/fonts.css';
import '../../src/lib/theme/base.css';
import '../../src/lib/theme/palettes.css';
import '../../src/lib/styles/app.css';
import '../../src/lib/styles/components.css';
import '../../src/lib/styles/screens.css';
import '../../src/lib/styles/kit.css';
import '../../src/lib/motion/press.css';
import '../../src/lib/motion/materials.css';
import { boot } from '../../src/lib/data/sqlite/boot';
import { createAndroidSqlite } from '../../src/lib/data/sqlite/android-driver';
import { openJournal } from '../../src/lib/data/journal/journal';
import { recordingDriver } from '../../src/lib/data/sqlite/test-support/recording-driver';
import { encryptedFileStore } from '../../src/lib/data/photos/encrypted-file-store';
import { appPrivatePhotoFiles } from '../../src/lib/data/photos/android-file-store';
import { journal, journalIsClosing } from '../../src/lib/data/live/journal.svelte';
import { prepareScreenJournal } from '../browser-tier/screen-journal';
import { setScreenRoute } from '../browser-tier/screen-router.svelte';
import { setLookBackDay } from '../long-journal/today-stub';
import { setLastLookBackSpan } from '../../src/lib/data/lookBackSpan';
import { generateLongJournal, TEN_YEARS_IN_DAYS } from '../long-journal/generate';
import { photoMaker } from './photos';
import { readOperations, setReadRecording } from './operation-recording';
import { pendingAdmissions } from '../../src/lib/data/live/hiddenReadAdmission';
import type { DoorPath } from '../../src/lib/navigation/RetainedDoors.svelte';

declare const __RETAINED64_BUILD__: unknown;

declare global {
  interface Window {
    __retainedDoorExperiment?: 'current' | 'deferred' | 'bounded';
    __retainedDoorResult?: unknown;
    __retainedDoorStage?: 'fixture' | 'awaiting-quiet' | 'measuring' | 'finished';
    __retainedDoorQuietGranted?: boolean;
    __retainedDoorFixtureProgress?: { entries: number; photos: number; elapsedMs: number };
    __retainedDoorFixture?: unknown;
  }
}

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const key = new Uint8Array(32).fill(7);

async function main() {
  window.__retainedDoorStage = 'fixture';
  document.documentElement.dataset.palette = 'rose';
  document.documentElement.dataset.theme = 'light';
  const native = createAndroidSqlite('retained-door-cost.sqlite3', key);
  const booted = await boot({ createDriver: () => native.driver, fileOps: native.fileOps });
  if (booted.phase === 'error') throw booted.error;
  const files = encryptedFileStore(appPrivatePhotoFiles('long-journal-photos'), key);
  let pending = 0;
  let completions = 0;
  const snapshot = booted.driver.readSnapshot;
  booted.driver.readSnapshot = async (read) => {
    pending++;
    try { return await snapshot(read); }
    finally { pending--; completions++; }
  };
  const recorder = recordingDriver(booted.driver);
  const raw = openJournal(recorder.driver, files);
  await raw.reconcileBuiltIns();
  const generatedAt = performance.now();
  const progress = { entries: 0, photos: 0, elapsedMs: 0 };
  window.__retainedDoorFixtureProgress = progress;
  const upsert = raw.entries.upsertEntry;
  raw.entries.upsertEntry = async (...args) => {
    const result = await upsert(...args);
    progress.entries++;
    progress.elapsedMs = performance.now() - generatedAt;
    return result;
  };
  const makePhoto = photoMaker();
  let summary;
  try {
    summary = await generateLongJournal(raw, { days: TEN_YEARS_IN_DAYS, makePhoto: async (n) => {
      const photo = await makePhoto(n);
      progress.photos++;
      progress.elapsedMs = performance.now() - generatedAt;
      return photo;
    } });
  } finally {
    raw.entries.upsertEntry = upsert;
  }
  const generatedInMs = performance.now() - generatedAt;
  window.__retainedDoorFixture = { summary, generatedInMs };
  const entry = (await raw.entries.recentDays(1))[0];
  assert(entry, 'fixture has no recent entry');
  setLookBackDay(summary.lastEpochDay);

  const query = recorder.driver.query;
  recorder.driver.query = async (...args) => {
    pending++;
    try { return await query(...args); }
    finally { pending--; completions++; }
  };
  const settle = async () => {
    const start = performance.now();
    let quiet = 0;
    let last = completions;
    while (quiet < 5) {
      await tick();
      await frame();
      quiet = pending === 0 && pendingAdmissions() === 0 && last === completions ? quiet + 1 : 0;
      last = completions;
      if (performance.now() - start > 30_000) throw new Error('retained reads did not settle');
    }
  };
  window.__retainedDoorStage = 'awaiting-quiet';
  const quietDeadline = performance.now() + 10 * 60_000;
  while (!window.__retainedDoorQuietGranted) {
    if (performance.now() > quietDeadline) throw new Error('quiet measurement reservation was not granted');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  window.__retainedDoorStage = 'measuring';
  const samples = [];
  try {
    // Alternate modes to avoid giving one mode every colder run.
    const modes = [
      'current', 'bounded', 'bounded', 'current', 'current', 'bounded',
      'current', 'bounded', 'bounded', 'current', 'current', 'bounded'
    ] as const;
    for (const [index, mode] of modes.entries()) {
      const traced = index >= 6;
      setReadRecording(traced);
      const measure = async <T>(operation: () => Promise<T>) => traced
        ? recorder.record(operation)
        : { result: await operation(), recording: null };
      window.__retainedDoorExperiment = mode;
      await raw.entries.upsertEntry({ id: entry.id, note: entry.note });
      let marker = `retaineddoorfreshness${index}`;
      let freshNotes = false;
      let notesCalls = 0;
      /* Look back's recap is the canary since functional audit ticket 12
         cut Words, whose whole-journal note read this used to watch. The
         counters reset just before each save, so any recap asked after that
         is the hidden door refreshing; the sample keys keep their old names
         so RESULTS.md stays comparable. */
      const recap = raw.stats.recap;
      raw.stats.recap = async (...args) => {
        notesCalls++;
        freshNotes = true;
        return recap(...args);
      };
      setLastLookBackSpan(null);
      await prepareScreenJournal(raw);
      setScreenRoute('/');
      const target = document.createElement('main');
      document.body.append(target);
      const host = mount(Host, { target });
      let mounted = true;
      const visit = async (path: DoorPath) => {
        setScreenRoute(path);
        host.visit(path);
        await tick();
        await settle();
      };
      try {
        for (const path of ['/', '/calendar', '/stats', '/more', '/'] as DoorPath[]) await visit(path);
        assert(target.querySelectorAll('[data-retained-door]').length === 4, 'probe did not retain four shipped doors');
        assert(target.querySelector('[data-lookback-readings]'), 'probe omitted shipped Look back readings');
        const hidden = [...target.querySelectorAll<HTMLElement>('[data-retained-door]:not([data-retained-active])')];
        assert(hidden.every((door) => door.inert && getComputedStyle(door).display === 'none'), 'hidden door lost concealment');
        notesCalls = 0;
        freshNotes = false;
        let completionMs = 0;
        readOperations.length = 0;
        const saveStart = performance.now();
        const saved = await measure(async () => {
          await journal.entries.upsertEntry({ id: entry.id, note: `${entry.note}\n${marker}` });
          completionMs = performance.now() - saveStart;
          await settle();
          return performance.now() - saveStart;
        });
        const saveReadOperations = readOperations.splice(0);
        const prior = target.querySelector('[data-retained-door="/stats"] [data-lookback-readings]');
        assert(prior, 'Look back last result missing before revisit');
        const hiddenNotesCalls = notesCalls;
        const hiddenFreshNotes = freshNotes;
        assert(hiddenNotesCalls > 0 && hiddenFreshNotes, 'bounded or current mode did not refresh retained Look back');
        notesCalls = 0;
        let firstPaint = {};
        const revisitStart = performance.now();
        const revisited = await measure(async () => {
          setScreenRoute('/stats');
          host.visit('/stats');
          await tick();
          firstPaint = {
            sameReadingNode: prior === target.querySelector('[data-retained-active] [data-lookback-readings]'),
            held: target.querySelectorAll('[data-retained-active] .read-group-members.is-held, [data-retained-active] [data-read-reserve-hold]').length,
            atMs: performance.now() - revisitStart
          };
          await settle();
          return performance.now() - revisitStart;
        });
        const revisitReadOperations = readOperations.splice(0);
        raw.stats.recap = recap;
        assert(freshNotes, 'revisit failed to re-read after the save');
        assert((firstPaint as { sameReadingNode: boolean }).sameReadingNode, 'warm revisit replaced last-result DOM');
        assert(!target.querySelector('[data-retained-active] .read-group-members.is-held, [data-retained-active] [data-read-reserve-hold]'), 'arrival hold did not release');
        await visit('/calendar');
        assert(target.querySelector('[data-retained-active]')?.textContent?.includes(marker), 'Calendar revisit did not paint saved note');
        const sample = { mode, index, traced, saveCompletionMs: completionMs, saveSettledMs: saved.result,
          saveStatements: saved.recording?.statements.length ?? null, saveBytes: saved.recording?.bytes ?? null,
          revisitSettledMs: revisited.result, revisitStatements: revisited.recording?.statements.length ?? null,
          revisitBytes: revisited.recording?.bytes ?? null, firstPaint, freshNotes, notesCalls, hiddenNotesCalls, hiddenFreshNotes,
          saveReadOperations, revisitReadOperations };

        // Revisit while dirty as well: waiting for settlement first hides a shifted refresh cost.
        await visit('/');
        marker = `retaineddoorimmediate${index}`;
        freshNotes = false;
        notesCalls = 0;
        readOperations.length = 0;
        const immediatePrior = target.querySelector('[data-retained-door="/stats"] [data-lookback-readings]');
        let immediateWriteMs = 0;
        let immediateStart = 0;
        let immediateSameNode = false;
        const immediateSaveStart = performance.now();
        const immediate = await measure(async () => {
          await journal.entries.upsertEntry({ id: entry.id, note: `${entry.note}\n${marker}` });
          immediateWriteMs = performance.now() - immediateSaveStart;
          immediateStart = performance.now();
          setScreenRoute('/stats');
          host.visit('/stats');
          await tick();
          immediateSameNode = immediatePrior === target.querySelector('[data-retained-active] [data-lookback-readings]');
          await settle();
          return performance.now() - immediateStart;
        });
        assert(immediateSameNode, 'immediate dirty revisit replaced retained reading DOM');
        assert(freshNotes, 'immediate dirty revisit failed to re-read after the save');
        samples.push({ ...sample, immediateDirtyRevisit: {
          writeMs: immediateWriteMs, settledMs: immediate.result, sameReadingNode: immediateSameNode,
          freshNotes, notesCalls, statements: immediate.recording?.statements.length ?? null,
          bytes: immediate.recording?.bytes ?? null, readOperations: readOperations.splice(0)
        } });
        host.visit(null);
        await tick();
        await unmount(host);
        mounted = false;
        assert(!target.querySelector('[data-retained-door]'), 'lock cleanup retained door DOM');
        await journalIsClosing();
      } finally {
        raw.stats.recap = recap;
        if (mounted) await unmount(host);
        target.remove();
      }
    }
    return { build: __RETAINED64_BUILD__, summary, generatedInMs, driver: 'native SQLCipher createAndroidSqlite with recordingDriver',
      userAgent: navigator.userAgent, samples };
  } finally {
    setReadRecording(false);
    setLookBackDay(null);
    setLastLookBackSpan(null);
    await journalIsClosing();
    await booted.driver.close();
  }
}

main().then((result) => { window.__retainedDoorStage = 'finished'; window.__retainedDoorResult = result; }, (error) => {
  window.__retainedDoorResult = { error: String(error?.stack ?? error),
    stage: window.__retainedDoorStage, mode: window.__retainedDoorExperiment,
    fixture: window.__retainedDoorFixture, readOperations: readOperations.slice(-30) };
});
