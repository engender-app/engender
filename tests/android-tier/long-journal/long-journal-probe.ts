/* The Android ten-year benchmark (phase 2 ticket 20).

   The web half of this measurement lives in tests/long-journal/probe.ts and runs
   under headless Chrome with OPFS and the web SQLite driver. This probe is the
   Android side: the same generator and harness, over the native SQLCipher driver
   and app-private photo files, served from the app's own WebView.

   The setup is the only thing that differs from the web probe. generate.ts and
   measure.ts are untouched - they speak openJournal(driver, files), which is the
   same contract both drivers satisfy. */

import { Capacitor } from '@capacitor/core';
import { androidAutoExport } from '../../../src/lib/data/archive/android-auto-export-bridge';
import { runAndroidAutoExport } from '../../../src/lib/data/archive/android-auto-export';
import { openArchive } from '../../../src/lib/data/archive/pack';
import { portablePreferences } from '../../../src/lib/data/archive/payload';
import { PREFERENCE_DEFAULTS } from '../../../src/lib/data/prefs/catalogue';
import type { ArchiveSnapshot } from '../../../src/lib/data/journal/archive';
import { boot } from '../../../src/lib/data/sqlite/boot.ts';
import { createAndroidSqlite } from '../../../src/lib/data/sqlite/android-driver.ts';
import { openJournal } from '../../../src/lib/data/journal/journal.ts';
import { recordingDriver } from '../../../src/lib/data/sqlite/test-support/recording-driver.ts';
import { encryptedFileStore } from '../../../src/lib/data/photos/encrypted-file-store.ts';
import { appPrivatePhotoFiles } from '../../../src/lib/data/photos/android-file-store.ts';
import { thumbFileName } from '../../../src/lib/data/photos/names.ts';
import { addJournalPassphrase, unlockJournalPassphrase } from '../../../src/lib/data/journal-passphrase.ts';
import { sweepOrphanPhotos } from '../../../src/lib/data/journal/photos.ts';
import { generateLongJournal, ONE_YEAR_IN_DAYS, TEN_YEARS_IN_DAYS } from '../../long-journal/generate.ts';
import { compareJournalSizes } from '../../long-journal/scaling.ts';
import { measureLongJournal } from '../../long-journal/measure.ts';
import type { NormalizedPhoto } from '../../../src/lib/data/journal/photos.ts';
import type { Measurement } from '../../long-journal/measure.ts';
import { snapshotOrigin, type OriginDirectory } from './origin-snapshot.ts';

declare global {
  interface Window {
    __longJournalResult?: unknown;
    __backupBenchmarkEnabled?: boolean;
    __backupBenchmarkRequest?: { days: number; phase: 'configure' | 'deliver' };
    __backupBenchmarkConfigured?: number;
    __backupBenchmarkDelivered?: { days: number; native: Record<string, unknown> };
  }
}

const PROBE_DATA_KEY = new Uint8Array(32).fill(7);
const PROBE_PASSPHRASE = 'android-long-journal-benchmark-passphrase';
const RECENT_DAYS = 5;

const publish = (value: unknown) => {
  window.__longJournalResult = value;
  document.body.dataset.longJournalReady = 'true';
};

/** What ADR-0008 normalizes to: 2048px on the long edge, 320px thumbnail. */
const FULL = { width: 2048, height: 1536 };
const THUMB = { width: 320, height: 240 };

/* A 256x256 tile of deterministic noise, drawn once and tiled over every
   photo, so the fixture cannot compress to nothing. Same algorithm as the
   web probe so the two benchmarks use photos of the same size on disk. */
function noiseTile(): OffscreenCanvas {
  const tile = new OffscreenCanvas(256, 256);
  const context = tile.getContext('2d')!;
  const image = context.createImageData(256, 256);
  let state = 0x9e3779b9;
  for (let i = 0; i < image.data.length; i += 4) {
    state = (Math.imul(state ^ (state >>> 15), 0x85ebca6b) + 0x165667b1) >>> 0;
    const value = state & 0xff;
    image.data[i] = value;
    image.data[i + 1] = (value * 3) & 0xff;
    image.data[i + 2] = (value * 7) & 0xff;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return tile;
}

function photoMaker(): (n: number) => Promise<NormalizedPhoto> {
  const tile = noiseTile();

  const draw = async (size: { width: number; height: number }, hue: number): Promise<Uint8Array> => {
    const canvas = new OffscreenCanvas(size.width, size.height);
    const context = canvas.getContext('2d')!;
    const gradient = context.createLinearGradient(0, 0, size.width, size.height);
    gradient.addColorStop(0, `hsl(${hue} 45% 72%)`);
    gradient.addColorStop(1, `hsl(${(hue + 40) % 360} 40% 45%)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, size.width, size.height);
    context.globalAlpha = 0.25;
    for (let y = 0; y < size.height; y += 256) {
      for (let x = 0; x < size.width; x += 256) context.drawImage(tile, x, y);
    }
    context.globalAlpha = 1;
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
    return new Uint8Array(await blob.arrayBuffer());
  };

  return async (n) => {
    const hue = (n * 37) % 360;
    return { full: await draw(FULL, hue), thumb: await draw(THUMB, hue) };
  };
}

const BACKUP_PASSWORD = 'long-journal automatic backup proof';
const waitFor = async (condition: () => boolean) => {
  const deadline = performance.now() + 180_000;
  while (!condition()) {
    if (performance.now() >= deadline) throw new Error('automatic backup instrumentation did not answer');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};

// Runs after scored operations. No archive bytes accumulate in this recorder.
async function measureAutomaticBackup(snapshot: ArchiveSnapshot, days: number) {
  window.__backupBenchmarkRequest = { days, phase: 'configure' };
  await waitFor(() => window.__backupBenchmarkConfigured === days);
  await androidAutoExport.setPassword({ password: BACKUP_PASSWORD });
  const preferences = { ...PREFERENCE_DEFAULTS, name: 'Long journal' };
  const crossings = { calls: 0, bytes: 0, base64Characters: 0, maxPieceBytes: 0, maxBase64Characters: 0, maxInFlight: 0 };
  const bridge = Capacitor as typeof Capacitor & {
    nativePromise(plugin: string, method: string, options: Record<string, unknown>): Promise<unknown>;
  };
  const original = bridge.nativePromise;
  let inFlight = 0;
  bridge.nativePromise = async (plugin, method, options) => {
    if (plugin !== 'AutoExport' || method !== 'appendBackup') return original.call(bridge, plugin, method, options);
    const text = options.base64 as string;
    const bytes = text.length / 4 * 3 - (text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0);
    crossings.calls++;
    crossings.bytes += bytes;
    crossings.base64Characters += text.length;
    crossings.maxPieceBytes = Math.max(crossings.maxPieceBytes, bytes);
    crossings.maxBase64Characters = Math.max(crossings.maxBase64Characters, text.length);
    crossings.maxInFlight = Math.max(crossings.maxInFlight, ++inFlight);
    try { return await original.call(bridge, plugin, method, options); }
    finally { inFlight--; }
  };
  const startedAt = performance.now();
  const snapshotAt = Date.now();
  let outcome;
  try {
    outcome = await runAndroidAutoExport({ snapshot, snapshotAt, preferences }, {
      scheduled: true,
      recordBackup: () => { throw new Error('staging reported delivery before verification'); }
    });
  } finally { bridge.nativePromise = original; }
  const stageMs = performance.now() - startedAt;
  if (outcome.outcome !== 'staged') throw new Error(`scheduled backup did not stage: ${JSON.stringify(outcome)}`);
  if (!crossings.calls || crossings.maxPieceBytes > 1024 * 1024 + 28 || crossings.maxInFlight !== 1) {
    throw new Error(`automatic backup transfer is not bounded: ${JSON.stringify(crossings)}`);
  }
  window.__backupBenchmarkRequest = { days, phase: 'deliver' };
  await waitFor(() => window.__backupBenchmarkDelivered?.days === days);
  const native = window.__backupBenchmarkDelivered!.native;
  if (native.bytes !== crossings.bytes || native.snapshotAt !== snapshotAt) throw new Error('staged metadata differs from transferred Archive');

  // Same streaming decoder as Archive recovery; consume every authenticated file.
  const response = await fetch('./delivered.ttbackup');
  if (!response.ok || !response.body) throw new Error('delivered Archive is unavailable');
  const reader = response.body.getReader();
  async function* body() {
    try {
      while (true) { const item = await reader.read(); if (item.done) break; yield item.value; }
    } finally { reader.releaseLock(); }
  }
  const recovered = await openArchive(body(), BACKUP_PASSWORD);
  if (JSON.stringify(recovered.payload.journal) !== JSON.stringify(snapshot.journal) ||
      JSON.stringify(recovered.payload.preferences) !== JSON.stringify(portablePreferences(preferences))) {
    throw new Error('delivered Archive payload differs from snapshot');
  }
  let files = 0;
  let fileBytes = 0;
  let maxFileBytes = 0;
  for await (const file of recovered.files) {
    const expected = await snapshot.readFile(file.name);
    if (expected.length !== file.bytes.length || expected.some((byte, index) => byte !== file.bytes[index])) {
      throw new Error(`delivered Archive file differs: ${file.name}`);
    }
    files++;
    fileBytes += file.bytes.length;
    maxFileBytes = Math.max(maxFileBytes, file.bytes.length);
  }
  if (files !== snapshot.files.length) throw new Error('delivered Archive file count differs');
  window.__backupBenchmarkRequest = undefined;
  return { stageMs, crossings, native, files, fileBytes, maxFileBytes, entries: snapshot.journal.entries.length };
}

async function run(days: number) {
  const suffix = days === ONE_YEAR_IN_DAYS ? '-one-year' : '';
  const databaseName = `long-journal-benchmark${suffix}.sqlite3`;
  const photoDirectory = `long-journal-photos${suffix}`;
  /* Fixed names let LongJournalBenchmarkTest delete both fixtures before
     launch. Each size gets its own empty database and photo directory. */
  const { driver, fileOps } = createAndroidSqlite(databaseName, PROBE_DATA_KEY);
  const files = encryptedFileStore(appPrivatePhotoFiles(photoDirectory), PROBE_DATA_KEY);

  const booted = await boot({ createDriver: () => driver, fileOps });
  if (booted.phase === 'error') throw booted.error;

  const journal = openJournal(booted.driver, files);
  await journal.reconcileBuiltIns();

  const startedAt = performance.now();
  const summary = await generateLongJournal(journal, { days, makePhoto: photoMaker() });
  const generatedInMs = Math.round(performance.now() - startedAt);

  await addJournalPassphrase(PROBE_DATA_KEY, PROBE_PASSPHRASE);
  await booted.driver.close();

  const startupState =
    `cold start after fixture generation; ${days}-day fixture already present; ` +
    `boot-migrations includes any schema work this build still needs`;
  const startup: Measurement[] = [];

  const unlockStartedAt = performance.now();
  const unlockedDataKey = await unlockJournalPassphrase(PROBE_PASSPHRASE);
  startup.push({
    name: 'unlock',
    what: 'cold start, passphrase unlock (Argon2id + data key unwrap)',
    ms: performance.now() - unlockStartedAt,
    detail: `${startupState}; key bytes ${unlockedDataKey.length}`
  });

  const reopenedSqlite = createAndroidSqlite(databaseName, unlockedDataKey);
  const reopenedFiles = encryptedFileStore(appPrivatePhotoFiles(photoDirectory), unlockedDataKey);

  const bootStartedAt = performance.now();
  const reopened = await boot({ createDriver: () => reopenedSqlite.driver, fileOps: reopenedSqlite.fileOps });
  if (reopened.phase === 'error') throw reopened.error;
  startup.push({
    name: 'boot-migrations',
    what: 'cold start, open driver and run migrations',
    ms: performance.now() - bootStartedAt,
    detail: `${startupState}; fixture ${summary.entries} entries across ${summary.daysWithEntries} days`
  });

  /* Over the recording adapter, so the mount budgets mean the same thing
     here as they do on desktop: the same statements counted the same way,
     with the Capacitor bridge underneath instead of a worker (phase 8
     audit ticket 01). */
  const recorder = recordingDriver(reopened.driver);
  const reopenedJournal = openJournal(recorder.driver, reopenedFiles);
  const rowsBeforeSweep = await reopenedJournal.photos.inJournal();
  const fileNames = await reopenedFiles.list();
  const fullNames = new Set(rowsBeforeSweep.flatMap((row) => (row.fileName ? [row.fileName] : [])));
  const thumbNames = new Set(rowsBeforeSweep.flatMap((row) => (row.fileName ? [thumbFileName(row.fileName)] : [])));
  const referenced = fileNames.filter((name) => fullNames.has(name) || thumbNames.has(name)).length;
  const orphanCandidates = fileNames.length - referenced;

  const sweepStartedAt = performance.now();
  await sweepOrphanPhotos(reopened.driver, reopenedFiles);
  startup.push({
    name: 'boot-sweep',
    what: 'cold start, orphan photo sweep over fixture storage',
    ms: performance.now() - sweepStartedAt,
    detail: `${startupState}; ${fileNames.length} files scanned, ${orphanCandidates} orphan candidate(s)`
  });

  const firstPaintStartedAt = performance.now();
  const [dimensions, presets, tagGroups, milestones, entryCount, bounds, recent, week] = await Promise.all([
    reopenedJournal.dimensions.getDimensions(),
    reopenedJournal.dimensions.getPresets(),
    reopenedJournal.tags.getTagGroups(),
    reopenedJournal.milestones.getMilestones(),
    reopenedJournal.entries.countAll(),
    reopenedJournal.eras.getJournalBounds(),
    reopenedJournal.entries.recentDays(RECENT_DAYS),
    reopenedJournal.stats.dayAverages('mood', summary.lastEpochDay - 6, summary.lastEpochDay)
  ]);
  startup.push({
    name: 'first-paint',
    what: 'cold start, boot reference reads + Home queries before first usable screen',
    ms: performance.now() - firstPaintStartedAt,
    detail:
      `${startupState}; ${dimensions.length} dimensions, ${presets.length} presets, ` +
      `${tagGroups.length} tag groups, ${milestones.length} milestones, ` +
      `${entryCount} entries since ${bounds?.firstEpochDay ?? 'nothing'}, ${recent.length} recent entries, ${week.length} week points`
  });

  let photoBytes = 0;
  for (const name of await reopenedFiles.list()) photoBytes += (await reopenedFiles.size(name)) ?? 0;

  let snapshot: ArchiveSnapshot | undefined;
  const originalSnapshot = reopenedJournal.archive.snapshot;
  reopenedJournal.archive.snapshot = async () => {
    const value = await originalSnapshot();
    snapshot ??= value;
    return value;
  };
  const measurements = await measureLongJournal(reopenedJournal, reopenedFiles, {
    today: summary.lastEpochDay,
    summary,
    recorder
  });

  reopenedJournal.archive.snapshot = originalSnapshot;
  if (!snapshot) throw new Error('Archive workload did not capture its snapshot');
  const automaticBackup = window.__backupBenchmarkEnabled
    ? await measureAutomaticBackup(snapshot, days)
    : { state: 'not-run', reason: 'Automatic backup measurement requires disposable emulator opt-in' };
  await reopened.driver.close();
  return { summary, measurements: [...startup, ...measurements], generatedInMs, photoBytes, automaticBackup };
}

/* The probe shares the app's origin, so it hands the origin back before it
   reports (origin-snapshot.ts, ux-carpet 216): the Java test ends the moment
   the result appears. A restore that fails is reported as the run's error,
   because a phone left holding the probe's keystore is worse than a failed
   benchmark. */
async function main() {
  const restoreOrigin = await snapshotOrigin(
    (await navigator.storage.getDirectory()) as unknown as OriginDirectory,
    localStorage
  );
  let result: Record<string, unknown>;
  try {
    const oneYear = await run(ONE_YEAR_IN_DAYS);
    const tenYears = await run(TEN_YEARS_IN_DAYS);
    result = { ...tenYears, oneYear, scaling: compareJournalSizes(oneYear, tenYears) };
  } catch (error) {
    result = { error: String((error as Error)?.stack ?? error) };
  }
  try {
    result.originRestored = await restoreOrigin();
  } catch (error) {
    result = { error: `the probe could not put the app's origin back: ${String((error as Error)?.stack ?? error)}` };
  }
  publish(result);
}

main().catch((error) => publish({ error: String((error as Error)?.stack ?? error) }));
