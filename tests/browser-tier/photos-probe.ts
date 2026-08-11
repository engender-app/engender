/* Browser-tier check for ticket 11. Two things can only be proved here:

   normalize() needs a real decoder and a real canvas, and the claims it
   makes are about bytes a canvas produced - that no EXIF survives
   (ADR-0015), that the rotation the EXIF described survived instead, and
   that a big photo comes back at 2048px. A Node-tier test could only
   assert against a stub encoder, which would prove nothing about the one
   that actually runs.

   The OPFS file store is the other: write/read/list/remove against real
   OPFS, plus the one that matters for safety - that it works in a
   subdirectory of its own, so the orphan sweep can never see the database
   file SQLocal keeps in the OPFS root. */

import { boot } from '../../src/lib/data/sqlite/boot.ts';
import { createWebSqlite } from '../../src/lib/data/sqlite/sqlocal-driver.ts';
import { openJournal } from '../../src/lib/data/journal/journal.ts';
import { sweepOrphanPhotos } from '../../src/lib/data/journal/photos.ts';
import { thumbFileName } from '../../src/lib/data/photos/names.ts';
import { normalizePhoto, MAX_EDGE, UnsupportedImageError } from '../../src/lib/data/photos/normalize.ts';
import {
  opfsPhotoFiles,
  PHOTO_DIRECTORY,
  type ListableDirectory
} from '../../src/lib/data/photos/opfs-file-store.ts';
import {
  ascii,
  metadataMarkers,
  segmentBody,
  withExifOrientation
} from '../../src/lib/data/photos/test-support/jpeg-metadata.ts';

/** A real JPEG of the given size, produced by the same canvas path the app
    uses - the closest this gets to "what a camera handed over". */
async function sourceJpeg(width: number, height: number): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d')!;
  // A gradient rather than a flat fill: a solid colour survives any
  // rotation, so it could not tell a baked orientation from a missing one.
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#c94f7c');
  gradient.addColorStop(1, '#2b6cb0');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  return new Uint8Array(await blob.arrayBuffer());
}

const sizeOf = async (bytes: Uint8Array): Promise<{ width: number; height: number }> => {
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]));
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
};

async function run() {
  const result: Record<string, unknown> = {};

  // --- normalize: size ----------------------------------------------------
  const big = await normalizePhoto(await sourceJpeg(4000, 3000));
  result.bigFull = await sizeOf(big.full);
  result.bigThumb = await sizeOf(big.thumb);
  result.thumbIsSmallerFile = big.thumb.length < big.full.length;

  const small = await normalizePhoto(await sourceJpeg(300, 200));
  result.smallFull = await sizeOf(small.full);

  // --- normalize: metadata and orientation (ADR-0015) ---------------------
  const tagged = withExifOrientation(await sourceJpeg(100, 50), 6);
  // The fixture really does carry EXIF going in, or the assertion below
  // would pass against an input that never had any.
  result.inputMarkers = metadataMarkers(tagged);
  const rotated = await normalizePhoto(tagged);
  result.outputMarkers = metadataMarkers(rotated.full);
  result.thumbMarkers = metadataMarkers(rotated.thumb);
  // Orientation 6 is a 90-degree rotation, so a 100x50 landscape has to
  // come back as a 50x100 portrait - in the pixels, with no tag left to
  // describe it.
  result.rotatedSize = await sizeOf(rotated.full);

  /* Chromium's canvas writes an APP2 ICC colour profile of its own into
     everything it encodes. That is the colour space of the bytes we just
     wrote, not anything carried over from the photo - but "it came from
     our encoder" is a claim worth checking rather than assuming, since an
     ICC profile is one of the places a camera can put a device name.

     Two unrelated sources, one of which carried EXIF: if the profile were
     coming from the photo, these two would differ. */
  const profileA = segmentBody(rotated.full, 'APP2/ICC_PROFILE');
  const profileB = segmentBody(big.full, 'APP2/ICC_PROFILE');
  result.iccProfilesMatch =
    profileA != null && profileB != null && String([...profileA]) === String([...profileB]);
  result.iccProfileLength = profileA?.length ?? null;

  // --- normalize: what it refuses ----------------------------------------
  const heic = new Uint8Array([0, 0, 0, 0x18, ...ascii('ftyp'), ...ascii('heic'), ...ascii('mif1heic')]);
  result.heic = await refusal(() => normalizePhoto(heic));
  result.junk = await refusal(() => normalizePhoto(ascii('this is not an image')));

  // --- the OPFS file store ------------------------------------------------
  const files = opfsPhotoFiles();
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  await files.write('probe.jpg', bytes);
  result.readBack = [...((await files.read('probe.jpg')) ?? [])];
  result.listed = await files.list();
  result.readMissing = await files.read('nothing-here.jpg');
  await files.remove('probe.jpg');
  result.listedAfterRemove = await files.list();
  // Removing what is not there has to stay quiet: deleteEntry and the
  // sweep both rely on it. Reaching the next line is the assertion.
  await files.remove('nothing-here.jpg');
  result.removeMissingWasQuiet = true;

  // The database SQLocal opened lives in the OPFS root; the photo store
  // must not be able to see it, or the sweep would delete it.
  const rootNames: string[] = [];
  const root = (await navigator.storage.getDirectory()) as ListableDirectory;
  for await (const name of root.keys()) rootNames.push(name);
  result.rootNames = rootNames;
  result.photoDirectory = PHOTO_DIRECTORY;
  result.maxEdge = MAX_EDGE;

  /* --- the whole creation path, on the real platform --------------------
     Everything above tests one piece. This runs the path a picked photo
     actually takes - normalize, attach, read the row back, load the
     thumbnail the way PhotoThumb does - against the real SQLocal driver
     and real OPFS, which is the only place it can be run at all. The Node
     tier can do the rows and the fake store, never the canvas or OPFS. */
  const { driver, fileOps } = createWebSqlite('photos-probe.sqlite3');
  const booted = await boot({ createDriver: () => driver, fileOps });
  if (booted.phase === 'error') throw booted.error;

  const journal = openJournal(booted.driver, files);
  await journal.reconcileBuiltIns();

  const picked = await sourceJpeg(3000, 2000);
  const normalized = await normalizePhoto(picked);
  const entryId = await journal.entries.upsertEntry({ epochDay: 20000, mood: 4 });
  const photoId = await journal.photos.attach({ entryId }, normalized);

  const entry = await journal.entries.getEntry(entryId);
  result.roundTrip = {
    photoCount: entry?.photos.length ?? 0,
    fileName: entry?.photos[0]?.fileName ?? null,
    expectedFileName: `${photoId}.jpg`
  };

  // What PhotoThumb does: read the derived thumbnail name, decode it, and
  // check it is the small one - the grid must never decode the full photo.
  const thumbBytes = await files.read(thumbFileName(entry!.photos[0].fileName!));
  result.thumbFromStore = thumbBytes ? await sizeOf(thumbBytes) : null;
  result.fullIsStoredToo = (await files.read(entry!.photos[0].fileName!)) !== null;

  // Deleting the entry takes both files, and the sweep finds nothing left
  // to do - the two halves of the delete rule, on real storage.
  await journal.entries.deleteEntry(entryId);
  result.filesAfterDelete = (await files.list()).filter((n) => n.startsWith(photoId));

  // An orphan the sweep must reclaim: a file with no row, like a crash
  // between writing bytes and inserting the row would leave.
  await files.write('00000000-0000-4000-8000-00000000dead.jpg', new Uint8Array([7]));
  await sweepOrphanPhotos(booted.driver, files);
  result.filesAfterSweep = await files.list();

  (window as unknown as { __photosProbeResult: unknown }).__photosProbeResult = result;
  document.body.dataset.photosProbeReady = 'true';
}

/** The name and message of whatever a call rejected with, or null if it
    resolved - so run.mjs can assert on the message the user would see. */
async function refusal(call: () => Promise<unknown>): Promise<{ name: string; message: string } | null> {
  try {
    await call();
    return null;
  } catch (error) {
    return {
      name: error instanceof UnsupportedImageError ? 'UnsupportedImageError' : String((error as Error)?.name),
      message: String((error as Error)?.message)
    };
  }
}

run().catch((err) => {
  (window as unknown as { __photosProbeResult: unknown }).__photosProbeResult = {
    error: String(err?.stack ?? err)
  };
  document.body.dataset.photosProbeReady = 'true';
});
