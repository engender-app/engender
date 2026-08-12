/* The claim gate on Android (ticket 13's sixth box, ticket 09's gate).

   Ticket 09 proved the at-rest claim on the web the only way the spec
   accepts: seed protected content of every kind the claim names, close the
   app, and read the raw bytes of everything it left behind
   (tests/browser-tier/encryption-probe.ts). This is the same proof on a
   phone, and it has to be its own probe because almost nothing about where
   the bytes end up is shared. The journal is an app-private file written by
   SQLCipher rather than an OPFS pool written by sqlite3mc, the pre-migration
   copy sits beside it in app storage, and the scan is a Java walk of the app
   data directory rather than a walk of the OPFS root.

   This half seeds and closes. AndroidEncryptionClaimTest does the reading,
   because a WebView cannot see the files SQLCipher wrote.

   The data key here is a fixed one rather than the Keystore's. What is under
   test on this side is that the files are ciphertext; that the real key comes
   out of Android Keystore and only after authentication is JournalKeystoreTest,
   on the same device, and the two together are the claim. A probe that had to
   present a fingerprint could not run unattended at all. */

import { boot } from '../../../src/lib/data/sqlite/boot.ts';
import { createAndroidSqlite } from '../../../src/lib/data/sqlite/android-driver.ts';
import { openJournal } from '../../../src/lib/data/journal/journal.ts';
import { appPrivatePhotoFiles } from '../../../src/lib/data/photos/android-file-store.ts';
import { encryptedFileStore } from '../../../src/lib/data/photos/encrypted-file-store.ts';

declare global {
  interface Window {
    __encryptionProbeResult?: unknown;
  }
}

const publish = (value: unknown) => {
  window.__encryptionProbeResult = value;
  document.body.dataset.encryptionProbeReady = 'true';
};

/** The database this probe owns. Deleted by the test before it launches, so
    every run migrates a fresh one rather than reopening yesterday's. */
const PROBE_DATABASE = 'encryption-probe.sqlite3';

/** Its photo directory, so the app's own is never touched. */
const PROBE_PHOTOS = 'encryption-probe-photos';

/* A fixed 32-byte key. Fixed so a failure repeats, and never a real one:
   nothing here is a journal anybody keeps. */
const DATA_KEY = new Uint8Array(
  Array.from({ length: 32 }, (_, i) => (i * 7 + 3) & 0xff)
) as Uint8Array<ArrayBuffer>;

/* The strings the Java half looks for. Kept identical there, by hand and by
   the comment on both sides - a shared constant would have to travel through
   the bundle, and the bundle is one of the things the scan has to skip. */
const SENTINELS = {
  note: 'sentinel-note-woke-up-early-9351',
  analyte: 'sentinel-analyte-estradiol',
  unit: 'sentinel-unit-pg/mL',
  reminder: 'sentinel-reminder-progynova-2114',
  milestone: 'sentinel-milestone-first-day-7738',
  photo: 'sentinel-photo-body-6627'
};

/** Real JPEG bytes with a sentinel in a comment segment, so both the image
    signature and readable content are on disk in one file if the encryption
    does not reach photos. The web probe builds the same fixture and its
    comment explains why the segment goes after the encoder's own first one. */
async function sentinelJpeg(): Promise<Uint8Array<ArrayBuffer>> {
  const canvas = new OffscreenCanvas(64, 64);
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#c94f7c';
  context.fillRect(0, 0, 64, 64);
  const jpeg = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg' })).arrayBuffer());
  const comment = new TextEncoder().encode(SENTINELS.photo);
  const segment = new Uint8Array(4 + comment.length);
  segment.set([0xff, 0xfe, (comment.length + 2) >> 8, (comment.length + 2) & 0xff]);
  segment.set(comment, 4);
  const at = 4 + ((jpeg[4] << 8) | jpeg[5]);
  const withComment = new Uint8Array(jpeg.length + segment.length);
  withComment.set(jpeg.subarray(0, at));
  withComment.set(segment, at);
  withComment.set(jpeg.subarray(at), at + segment.length);
  return withComment as Uint8Array<ArrayBuffer>;
}

async function run() {
  const result: Record<string, unknown> = {};

  const { driver, fileOps, requestPersistentStorage } = createAndroidSqlite(PROBE_DATABASE, DATA_KEY);
  const booted = await boot({ createDriver: () => driver, fileOps, requestPersistentStorage });
  if (booted.phase === 'error') throw booted.error;

  const files = encryptedFileStore(appPrivatePhotoFiles(PROBE_PHOTOS), DATA_KEY);
  const journal = openJournal(driver, files);
  await journal.reconcileBuiltIns();

  const entryId = await journal.entries.upsertEntry({
    epochDay: 20000,
    mood: 4,
    note: SENTINELS.note,
    dims: {},
    tags: []
  });
  await journal.photos.attach({ entryId }, { full: await sentinelJpeg(), thumb: await sentinelJpeg() });
  await journal.labs.upsertResult({
    epochDay: 20000,
    analyte: SENTINELS.analyte,
    value: 424242.5,
    unit: SENTINELS.unit
  });
  await journal.reminders.upsertReminder({
    title: SENTINELS.reminder,
    type: 'med',
    time: '09:00',
    recurrence: 'DAILY',
    interval: null,
    anchorEpochDay: null,
    epochDay: null,
    enabled: true
  });
  await journal.milestones.upsertMilestone({ name: SENTINELS.milestone, epochDay: 19000 });

  /* ADR-0006's copy is a persistent file too, and one a scan of the live
     database alone would miss. Forced so the bytes are there to read. */
  await fileOps.copyDatabaseFile();

  /* Search has to work over the encrypted index, or the encryption bought
     itself a dead feature. Asserted while the journal is still open, since
     afterwards there is nothing to ask. */
  const hits = await driver.query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM entry_fts WHERE entry_fts MATCH 'sentinel'"
  );
  result.searchHitsWhileOpen = hits[0].n;

  /* Read back through the store, so the scan below is proving that the
     ciphertext is unreadable rather than that the photo was never written. */
  const entry = await journal.entries.getEntry(entryId);
  result.reopenedNote = entry?.note;
  const photoName = entry?.photos[0]?.fileName ?? null;
  result.photoName = photoName;
  result.photoIsAJpegThroughTheStore = await (async () => {
    if (!photoName) return false;
    const bytes = await files.read(photoName);
    return bytes !== null && bytes[0] === 0xff && bytes[1] === 0xd8;
  })();

  await driver.close();
  publish(result);
}

run().catch((error) => publish({ error: String((error as Error)?.stack ?? error) }));
