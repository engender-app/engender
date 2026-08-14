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
import { opfsPhotoFiles } from '../../src/lib/data/photos/opfs-file-store.ts';
import { encryptedFileStore } from '../../src/lib/data/photos/encrypted-file-store.ts';
import { freshOrigin, PROBE_DATA_KEY } from '../browser-tier/fresh-origin.ts';
import { generateLongJournal, TEN_YEARS_IN_DAYS } from './generate.ts';
import { measureLongJournal } from './measure.ts';
import type { NormalizedPhoto } from '../../src/lib/data/journal/photos.ts';

const publish = (value: unknown) => {
  (window as unknown as { __longJournalResult: unknown }).__longJournalResult = value;
  document.body.dataset.longJournalReady = 'true';
};

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
  for (const name of await rawFiles.list()) photoBytes += (await rawFiles.size(name)) ?? 0;

  const measurements = await measureLongJournal(journal, files, {
    today: summary.lastEpochDay,
    summary
  });

  await booted.driver.close();
  publish({ summary, measurements, generatedInMs, photoBytes });
}

run().catch((error) => publish({ error: String((error as Error)?.stack ?? error) }));
