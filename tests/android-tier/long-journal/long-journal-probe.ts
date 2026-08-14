/* The Android ten-year benchmark (phase 2 ticket 20).

   The web half of this measurement lives in tests/long-journal/probe.ts and runs
   under headless Chrome with OPFS and the web SQLite driver. This probe is the
   Android side: the same generator and harness, over the native SQLCipher driver
   and app-private photo files, served from the app's own WebView.

   The setup is the only thing that differs from the web probe. generate.ts and
   measure.ts are untouched - they speak openJournal(driver, files), which is the
   same contract both drivers satisfy. */

import { boot } from '../../../src/lib/data/sqlite/boot.ts';
import { createAndroidSqlite } from '../../../src/lib/data/sqlite/android-driver.ts';
import { openJournal } from '../../../src/lib/data/journal/journal.ts';
import { encryptedFileStore } from '../../../src/lib/data/photos/encrypted-file-store.ts';
import { appPrivatePhotoFiles } from '../../../src/lib/data/photos/android-file-store.ts';
import { thumbFileName } from '../../../src/lib/data/photos/names.ts';
import { addJournalPassphrase, unlockJournalPassphrase } from '../../../src/lib/data/journal-passphrase.ts';
import { sweepOrphanPhotos } from '../../../src/lib/data/journal/photos.ts';
import { generateLongJournal, TEN_YEARS_IN_DAYS } from '../../long-journal/generate.ts';
import { measureLongJournal } from '../../long-journal/measure.ts';
import type { NormalizedPhoto } from '../../../src/lib/data/journal/photos.ts';
import type { Measurement } from '../../long-journal/measure.ts';

declare global {
  interface Window {
    __longJournalResult?: unknown;
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

async function run() {
  /* One fixed name, so LongJournalBenchmarkTest can delete it before launch
     and each run starts from an empty database. */
  const { driver, fileOps } = createAndroidSqlite('long-journal-benchmark.sqlite3', PROBE_DATA_KEY);
  const files = encryptedFileStore(appPrivatePhotoFiles('long-journal-photos'), PROBE_DATA_KEY);

  const booted = await boot({ createDriver: () => driver, fileOps });
  if (booted.phase === 'error') throw booted.error;

  const journal = openJournal(booted.driver, files);
  await journal.reconcileBuiltIns();

  const startedAt = performance.now();
  const summary = await generateLongJournal(journal, { days: TEN_YEARS_IN_DAYS, makePhoto: photoMaker() });
  const generatedInMs = Math.round(performance.now() - startedAt);

  await addJournalPassphrase(PROBE_DATA_KEY, PROBE_PASSPHRASE);
  await booted.driver.close();

  const startupState =
    `cold start after fixture generation; decade fixture already present; ` +
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

  const reopenedSqlite = createAndroidSqlite('long-journal-benchmark.sqlite3', unlockedDataKey);
  const reopenedFiles = encryptedFileStore(appPrivatePhotoFiles('long-journal-photos'), unlockedDataKey);

  const bootStartedAt = performance.now();
  const reopened = await boot({ createDriver: () => reopenedSqlite.driver, fileOps: reopenedSqlite.fileOps });
  if (reopened.phase === 'error') throw reopened.error;
  startup.push({
    name: 'boot-migrations',
    what: 'cold start, open driver and run migrations',
    ms: performance.now() - bootStartedAt,
    detail: `${startupState}; fixture ${summary.entries} entries across ${summary.daysWithEntries} days`
  });

  const reopenedJournal = openJournal(reopened.driver, reopenedFiles);
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
  const [dimensions, presets, tagGroups, milestones, streak, recent, week] = await Promise.all([
    reopenedJournal.dimensions.getDimensions(),
    reopenedJournal.dimensions.getPresets(),
    reopenedJournal.tags.getTagGroups(),
    reopenedJournal.milestones.getMilestones(),
    reopenedJournal.stats.streak(summary.lastEpochDay),
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
      `streak ${streak}, ${recent.length} recent entries, ${week.length} week points`
  });

  let photoBytes = 0;
  for (const name of await reopenedFiles.list()) photoBytes += (await reopenedFiles.size(name)) ?? 0;

  const measurements = await measureLongJournal(reopenedJournal, reopenedFiles, {
    today: summary.lastEpochDay,
    summary
  });

  await reopened.driver.close();
  publish({ summary, measurements: [...startup, ...measurements], generatedInMs, photoBytes });
}

run().catch((error) => publish({ error: String((error as Error)?.stack ?? error) }));
