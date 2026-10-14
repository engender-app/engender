/* Production EntryEditor ownership, using real Chromium synthetic tracks.
   Derived from the audit's delayed-permission reproduction. The fixture
   supplies storage and router ports; shell concealment is checked separately. */
import { flushSync } from 'svelte';
import EntryEditor from '../../src/lib/components/EntryEditor.svelte';
import { createEncryptedWebSqlite } from '../../src/lib/data/sqlite/mc-driver';
import { boot } from '../../src/lib/data/sqlite/boot';
import { openJournal } from '../../src/lib/data/journal/journal';
import { opfsPhotoFiles } from '../../src/lib/data/photos/opfs-file-store';
import { encryptedFileStore } from '../../src/lib/data/photos/encrypted-file-store';
import { attachJournal, journalIsOpen } from '../../src/lib/data/live/journal.svelte';
import { hydrateReference } from '../../src/lib/data/live/reference.svelte';
import { openPreferences } from '../../src/lib/data/prefs/preferences';
import { attachPreferences } from '../../src/lib/data/prefs/store.svelte';
import { localStorageCache } from '../../src/lib/data/prefs/boot-cache';
import { refreshActiveFlag } from '../../src/lib/theme/activeFlag.svelte';
import { setPhotoFiles } from '../../src/lib/stores/photoFiles';
import { clearToasts, toasts } from '../../src/lib/stores/toasts.svelte';
import { startVideoRecording } from '../../src/lib/stores/videoRecording';
import { VIDEO_MAX_DURATION_MS } from '../../src/lib/data/videoNotes/limits';
import { mountInto, publishFixture } from './mount';
import { freshOrigin, PROBE_DATA_KEY } from './fresh-origin';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until<T>(read: () => T, what: string): Promise<NonNullable<T>> {
  for (let n = 0; n < 500; n++) {
    flushSync();
    const value = read();
    if (value) return value!;
    await delay(10);
  }
  throw new Error(`timed out waiting for ${what}`);
}
type Kind = 'voice' | 'video';
const target = document.getElementById('editor')!;
const realOpen = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
const RealRecorder = window.MediaRecorder;
const states = (streams: MediaStream[]) => streams.flatMap(stream => stream.getTracks().map(track => track.readyState));
const ended = (streams: MediaStream[]) => states(streams).length > 0 && states(streams).every(state => state === 'ended');
const buttonFor = (kind: Kind) => target.querySelector<HTMLButtonElement>(`[data-editor-section="${kind}"] .photo-add`);
let day = 20_000;
async function editor(kind: Kind) {
  localStorage.removeItem('engender-entry-draft');
  clearToasts();
  const epochDay = day++;
  const screen = mountInto(EntryEditor, { epochDay, seedMood: 4, openSection: kind }, target);
  const button = await until(() => buttonFor(kind), 'capture control');
  return { ...screen, button, epochDay };
}

async function lateOpen(kind: Kind, taps: number, refusal: boolean) {
  let release!: () => void;
  const permission = new Promise<void>(resolve => { release = resolve; });
  let requested = 0;
  const streams: MediaStream[] = [];
  const recorders: MediaRecorder[] = [];
  navigator.mediaDevices.getUserMedia = async constraints => {
    requested++;
    await permission;
    if (refusal) throw new DOMException('synthetic permission refusal', 'NotAllowedError');
    const stream = await realOpen(constraints);
    streams.push(stream);
    return stream;
  };
  window.MediaRecorder = new Proxy(RealRecorder, {
    construct(Type, args) {
      const recorder = Reflect.construct(Type, args) as MediaRecorder;
      recorders.push(recorder);
      return recorder;
    }
  });
  const screen = await editor(kind);
  for (let i = 0; i < taps; i++) screen.button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await until(() => requested > 0, 'permission request');
  flushSync();
  const pending = screen.button.getAttribute('aria-disabled') === 'true' && screen.button.getAttribute('aria-busy') === 'true';
  await screen.remove();
  const replacement = await editor(kind);
  release();
  if (!refusal) await until(() => streams.length === requested && ended(streams), 'cancelled tracks');
  await delay(50);
  const result = {
    kind, taps, refusal, requested, pending, tracks: states(streams), recorders: recorders.length,
    attachedToReplacement: target.querySelectorAll('.recording-row,.video-row,.video-preview').length,
    delayedFeedback: toasts.length
  };
  await replacement.remove();
  navigator.mediaDevices.getUserMedia = realOpen;
  window.MediaRecorder = RealRecorder;
  return result;
}

async function run() {
  await freshOrigin();
  refreshActiveFlag();
  const { driver, fileOps } = createEncryptedWebSqlite('entry-capture.sqlite3', PROBE_DATA_KEY);
  const opened = await boot({ createDriver: () => driver, fileOps });
  if (opened.phase === 'error') throw opened.error;
  const rawFiles = opfsPhotoFiles();
  const files = encryptedFileStore(rawFiles, PROBE_DATA_KEY);
  setPhotoFiles(files);
  const journal = attachJournal(openJournal(driver, files));
  await journal.reconcileBuiltIns();
  await hydrateReference(journal);
  await attachPreferences(await openPreferences(driver, localStorageCache()));
  journalIsOpen();
  const intervals = new Set<number>();
  const caps = new Set<number>();
  const setInterval = window.setInterval.bind(window);
  const clearInterval = window.clearInterval.bind(window);
  const setTimeout = window.setTimeout.bind(window);
  const clearTimeout = window.clearTimeout.bind(window);
  window.setInterval = ((handler: TimerHandler, ms?: number, ...args: unknown[]) => {
    const id = setInterval(handler, ms, ...args); intervals.add(id); return id;
  }) as typeof window.setInterval;
  window.clearInterval = ((id?: number) => { intervals.delete(id!); clearInterval(id); }) as typeof window.clearInterval;
  window.setTimeout = ((handler: TimerHandler, ms?: number, ...args: unknown[]) => {
    const id = setTimeout(handler, ms, ...args);
    if (ms === VIDEO_MAX_DURATION_MS) caps.add(id);
    return id;
  }) as typeof window.setTimeout;
  window.clearTimeout = ((id?: number) => { caps.delete(id!); clearTimeout(id); }) as typeof window.clearTimeout;
  try {
    const late = [];
    for (const kind of ['voice', 'video'] as const) {
      for (const taps of [1, 2]) late.push(await lateOpen(kind, taps, false));
      late.push(await lateOpen(kind, 1, true));
    }

    const failures = [];
    for (const failure of ['constructor', 'start', 'stop', 'teardown-stop']) {
      const streams: MediaStream[] = [];
      navigator.mediaDevices.getUserMedia = async constraints => {
        const stream = await realOpen(constraints); streams.push(stream); return stream;
      };
      class FailingRecorder {
        static isTypeSupported() { return true; }
        state = 'recording';
        constructor() { if (failure === 'constructor') throw new Error('synthetic constructor failure'); }
        start() { if (failure === 'start') throw new Error('synthetic start failure'); }
        stop() { throw new Error('synthetic stop failure'); }
      }
      window.MediaRecorder = FailingRecorder as unknown as typeof MediaRecorder;
      const screen = await editor('video');
      screen.button.click();
      if (failure === 'stop' || failure === 'teardown-stop') {
        await until(() => target.querySelector('.video-preview'), 'video preview');
        if (failure === 'stop') screen.button.click();
        else await screen.remove();
      }
      await until(() => ended(streams), 'failed recorder tracks');
      if (failure !== 'teardown-stop') await until(() => toasts.length > 0 && !screen.button.disabled && screen.button.getAttribute('aria-disabled') !== 'true', 'failure feedback and retry');
      flushSync();
      const feedback = toasts.length;
      const retryEnabled = failure === 'teardown-stop' || (!screen.button.disabled && screen.button.getAttribute('aria-disabled') !== 'true');
      let retried = false;
      if (failure !== 'teardown-stop') {
        window.MediaRecorder = RealRecorder;
        screen.button.click();
        await until(() => target.querySelector('.video-preview'), 'retry preview');
        await delay(700);
        screen.button.click();
        await until(() => target.querySelector('.video-row'), 'retry captured video');
        retried = true;
        await screen.remove();
      }
      failures.push({ failure, tracks: states(streams), feedback, retryEnabled, retried });
      window.MediaRecorder = RealRecorder;
      navigator.mediaDevices.getUserMedia = realOpen;
    }

    const healthy = [];
    for (const kind of ['voice', 'video'] as const) {
      const streams: MediaStream[] = [];
      let refuse = true;
      navigator.mediaDevices.getUserMedia = async constraints => {
        if (refuse) throw new DOMException('synthetic permission refusal', 'NotAllowedError');
        const stream = await realOpen(constraints); streams.push(stream); return stream;
      };
      const screen = await editor(kind);
      screen.button.click();
      await until(() => toasts.length > 0 && !screen.button.disabled && screen.button.getAttribute('aria-disabled') !== 'true', 'permission refusal and retry');
      refuse = false;
      const idleLabel = screen.button.getAttribute('aria-label');
      screen.button.click();
      await until(() => streams.length === 1 && screen.button.getAttribute('aria-label') !== idleLabel, 'capture');
      await delay(700);
      screen.button.click();
      const media = await until(() => target.querySelector<HTMLMediaElement>(kind === 'voice' ? '.recording-row audio' : '.video-row video'), 'recorded playback');
      media.muted = true;
      await media.play();
      await until(() => media.currentTime > 0, 'playback progress');
      media.pause();
      const save = await until(() => {
        const button = target.querySelector<HTMLButtonElement>('[data-save]');
        return button && !button.disabled ? button : null;
      }, 'save');
      save.click();
      await until(() => target.querySelector('[data-entry-saved]'), 'saved entry');
      const [entry] = await journal.entries.entriesForDay(screen.epochDay);
      const rows = kind === 'voice' ? entry.recordings : entry.videos;
      const bytes = await files.read(rows[0].fileName);
      const raw = await rawFiles.read(rows[0].fileName);
      await screen.remove();
      const reopened = mountInto(EntryEditor, { entryId: entry.id }, target);
      (await until(() => target.querySelector<HTMLButtonElement>(`[data-section-chip="${kind}"]`), 'saved media section')).click();
      const storedMedia = await until(() => target.querySelector<HTMLMediaElement>(kind === 'voice' ? '.recording-row audio' : '.video-row video'), 'saved playback');
      storedMedia.muted = true;
      await storedMedia.play();
      await until(() => storedMedia.currentTime > 0, 'saved playback progress');
      storedMedia.pause();
      healthy.push({ kind, count: rows.length, bytes: bytes!.length, encrypted: raw!.length > bytes!.length, storedPlayback: true, tracks: states(streams) });
      await reopened.remove();
      navigator.mediaDevices.getUserMedia = realOpen;
    }

    const capped = (await startVideoRecording())!;
    await capped.capped;
    const cap = { tracks: states([capped.stream]), bytes: (await capped.stop())!.length };
    return { late, failures, healthy, cap, intervals: intervals.size, capTimers: caps.size };
  } finally {
    window.setInterval = setInterval; window.clearInterval = clearInterval;
    window.setTimeout = setTimeout; window.clearTimeout = clearTimeout;
    navigator.mediaDevices.getUserMedia = realOpen;
    window.MediaRecorder = RealRecorder;
    setPhotoFiles(null);
    await driver.close();
  }
}
publishFixture('entry-capture-probe', run);
