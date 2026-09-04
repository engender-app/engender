/* The ten-year run, in the browser (phase 2 ticket 20).

   Encryption is on, because that is what ships: the driver is the
   SQLite3MultipleCiphers one under a data key (ADR-0018/0020) and the photo
   files go through the encrypting store, so every number below includes the
   cost of decrypting to answer.

   The generator and the harness know nothing about either. They speak
   `openJournal(driver, files)` (ADR-0017), which is the same contract
   ticket 11's native SQLite driver satisfies - so the Android half of this
   measurement is a different twenty lines of setup here and nothing else.

   Photo bytes are supplied from this side because a representative photo
   needs a canvas: real JPEG bytes at the sizes ADR-0008 normalizes to, with
   enough high-frequency detail that they compress like a photograph rather
   than like a gradient. The size of the file is most of what the photo grid
   and the Archive export are measuring. */

import { boot } from '../../src/lib/data/sqlite/boot.ts';
import { createEncryptedWebSqlite } from '../../src/lib/data/sqlite/mc-driver.ts';
import { openJournal } from '../../src/lib/data/journal/journal.ts';
import { recordingDriver } from '../../src/lib/data/sqlite/test-support/recording-driver.ts';
import { opfsPhotoFiles } from '../../src/lib/data/photos/opfs-file-store.ts';
import { encryptedFileStore } from '../../src/lib/data/photos/encrypted-file-store.ts';
import { purgeExpiredTrash } from '../../src/lib/data/journal/entries.ts';
import { sweepOrphanPhotos } from '../../src/lib/data/journal/photos.ts';
import { freshOrigin, PROBE_DATA_KEY } from '../browser-tier/fresh-origin.ts';
import { generateLongJournal, TEN_YEARS_IN_DAYS } from './generate.ts';
import { measureLongJournal, STARTUP_MEASUREMENT_NAMES, type Measurement } from './measure.ts';
import type { NormalizedPhoto } from '../../src/lib/data/journal/photos.ts';
import { publish as publishResult } from '../probe-handshake.mjs';

const NAME = 'long-journal';
const publish = (value: unknown) => publishResult(NAME, value);

/** What ADR-0008 normalizes to: 2048px on the long edge, 320px thumbnail. */
const FULL = { width: 2048, height: 1536 };
const THUMB = { width: 320, height: 240 };

/* A 256x256 tile of deterministic noise, drawn once and tiled 1:1 over
   every photo. Without it a gradient compresses to a few kilobytes and the
   fixture would claim a decade of photos weighs nothing. */
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

    /* Enough noise that the encoder cannot cheat, not so much that the
       fixture claims every photo is a megabyte. Tuned against the run:
       0.25 lands the full size around 600KB, which is what a phone photo
       weighs once ADR-0008 has taken it down to 2048px. */
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
  await freshOrigin();

  const rawFiles = opfsPhotoFiles('long-journal-photos');
  const files = encryptedFileStore(rawFiles, PROBE_DATA_KEY);
  const { driver, fileOps } = createEncryptedWebSqlite('long-journal.sqlite3', PROBE_DATA_KEY);
  const booted = await boot({ createDriver: () => driver, fileOps });
  if (booted.phase === 'error') throw booted.error;

  const journal = openJournal(booted.driver, files);
  await journal.reconcileBuiltIns();

  const startedAt = performance.now();
  const summary = await generateLongJournal(journal, { days: TEN_YEARS_IN_DAYS, makePhoto: photoMaker() });
  const generatedInMs = Math.round(performance.now() - startedAt);

  // On raw OPFS rather than through the encrypting store: what the fixture
  // costs the device is the ciphertext on disk, not the plaintext length.
  let photoBytes = 0;
  const fileNames = await rawFiles.list();
  for (const name of fileNames) photoBytes += (await rawFiles.size(name)) ?? 0;

  /* The second open is the one worth timing (phase 5 audit ticket 02). The
     first one above migrated an empty database; this one is the boot every
     later one is - a decade of Journal already on the current schema - which
     is the sequence a person waits through before a screen can read anything.

     The three numbers are separated on purpose: what a screen waits for is
     `boot-ready`, and the two housekeeping passes are what used to be in front
     of it. Their cost at this scale is what the ticket wanted written down. */
  await booted.driver.close();

  const reopenedSqlite = createEncryptedWebSqlite('long-journal.sqlite3', PROBE_DATA_KEY);
  const reopenedFiles = encryptedFileStore(rawFiles, PROBE_DATA_KEY);
  const fixtureDetail = `decade fixture already present, schema current; ${summary.entries} entries across ${summary.daysWithEntries} days`;
  const startup: Measurement[] = [];
  // From the constant, so the names the budgets are checked against and the
  // names a run publishes cannot drift apart.
  const [READY, PURGE, SWEEP] = STARTUP_MEASUREMENT_NAMES;

  let runHousekeeping: (() => void) | null = null;
  let purgeMs = 0;
  let purged = 0;
  let sweepMs = 0;

  const bootStartedAt = performance.now();
  const reopened = await boot({
    createDriver: () => reopenedSqlite.driver,
    fileOps: reopenedSqlite.fileOps,
    purgeExpiredTrash: async (opened) => {
      const startedAt = performance.now();
      purged = await purgeExpiredTrash(opened, reopenedFiles);
      purgeMs = performance.now() - startedAt;
    },
    sweepOrphanPhotos: async (opened) => {
      const startedAt = performance.now();
      await sweepOrphanPhotos(opened, reopenedFiles);
      sweepMs = performance.now() - startedAt;
    },
    // Held rather than scheduled, so the housekeeping cost cannot land inside
    // the ready measurement the way an immediate one could.
    scheduleHousekeeping: (run) => {
      runHousekeeping = run;
    }
  });
  const bootReadyMs = performance.now() - bootStartedAt;
  if (reopened.phase === 'error') throw reopened.error;

  startup.push({
    name: READY,
    what: 'cold start, open the journal and report ready',
    ms: bootReadyMs,
    detail: fixtureDetail
  });

  runHousekeeping!();
  await reopened.housekeeping;

  startup.push({
    name: PURGE,
    what: 'boot housekeeping, purge trash past its 30-day window',
    ms: purgeMs,
    detail: `${fixtureDetail}; ${purged} entries reclaimed`
  });
  startup.push({
    name: SWEEP,
    what: 'boot housekeeping, orphan photo sweep over fixture storage',
    ms: sweepMs,
    detail: `${fixtureDetail}; ${fileNames.length} attachment files scanned against ${summary.photos} photo rows`
  });

  /* The screen mounts are counted at the driver seam rather than timed, so
     the journal they are measured over is opened on the recording adapter
     (phase 8 audit ticket 01). It records only inside the windows the
     harness opens, so nothing above pays for it. */
  const recorder = recordingDriver(reopened.driver);
  const measurements = await measureLongJournal(openJournal(recorder.driver, reopenedFiles), reopenedFiles, {
    today: summary.lastEpochDay,
    summary,
    recorder
  });

  await reopened.driver.close();
  publish({ summary, measurements: [...startup, ...measurements], generatedInMs, photoBytes });
}

run().catch((error) => publish({ error: String((error as Error)?.stack ?? error) }));
