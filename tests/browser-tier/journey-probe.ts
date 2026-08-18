/* Browser-tier check for ticket 27's photo journey export.

   Three things can only be proved here. The collage and the timelapse are
   bytes a canvas produced, so a Node-tier test could only assert against a
   stub encoder. MediaRecorder does not exist in Node at all. And the claim
   the ticket actually makes - that generating an export transmits nothing,
   and only the share step does - is a claim about navigator.share, which
   means watching a real one.

   The source photos are three flat colours in journey order, which is what
   makes the composition checkable: a collage that drew them out of order,
   or drew the surround where a photo should be, comes back with the wrong
   pixel in the wrong cell. */

import { collageLayout, fitCover, journeyFileName, TIMELAPSE_EDGE } from '../../src/lib/data/photos/journey.ts';
import {
  recordTimelapse,
  renderCollage,
  timelapseSupported,
  type JourneyFrame
} from '../../src/lib/data/photos/journey-render.ts';
import { deliverBlob } from '../../src/lib/data/archive/deliver.ts';

/** A real JPEG of one flat colour, made the way a stored photo was made -
    through a canvas encode (ADR-0008). */
async function solidJpeg(width: number, height: number, colour: string): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d')!;
  context.fillStyle = colour;
  context.fillRect(0, 0, width, height);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 });
  return new Uint8Array(await blob.arrayBuffer());
}

const RED = '#dc2828';
const GREEN = '#28c850';
const BLUE = '#3250dc';

/** The pixel at (x, y) of an image blob, as [r, g, b]. */
async function pixelAt(blob: Blob, x: number, y: number): Promise<number[]> {
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  const data = context.getImageData(x, y, 1, 1).data;
  bitmap.close();
  return [data[0], data[1], data[2]];
}

const signature = (bytes: Uint8Array, length: number) => [...bytes.slice(0, length)];

/** The first frame the video actually presents, drawn into a canvas.

    Played rather than seeked: WebM out of MediaRecorder carries no duration
    in its header - it is written as if it were a live stream - so there is
    no timestamp to seek to and `duration` reads back as Infinity. And
    `loadeddata` is too early to draw from; the element reports its size
    there but the compositor has nothing yet, which is a black frame.
    requestVideoFrameCallback is the event that means a frame exists. */
async function firstVideoFrame(blob: Blob): Promise<{ width: number; height: number; centre: number[] }> {
  const video = document.createElement('video');
  video.muted = true;
  video.src = URL.createObjectURL(blob);
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error('the recorded timelapse would not decode'));
  });
  await video.play();
  await new Promise<void>((resolve) => video.requestVideoFrameCallback(() => resolve()));
  video.pause();

  const canvas = new OffscreenCanvas(video.videoWidth, video.videoHeight);
  const context = canvas.getContext('2d')!;
  context.drawImage(video, 0, 0);
  const data = context.getImageData(video.videoWidth / 2, video.videoHeight / 2, 1, 1).data;
  URL.revokeObjectURL(video.src);
  return { width: video.videoWidth, height: video.videoHeight, centre: [data[0], data[1], data[2]] };
}

async function run() {
  const result: Record<string, unknown> = {};

  /* A store standing in for the real one. What the export reads is full
     photo bytes by file name, which is all encryptedFileStore gives it -
     the photos probe already covers that store against real OPFS, so
     repeating it here would test the store twice and the export not at
     all. */
  const stored = new Map<string, Uint8Array>([
    ['red.jpg', await solidJpeg(1200, 800, RED)],
    ['green.jpg', await solidJpeg(800, 1200, GREEN)],
    ['blue.jpg', await solidJpeg(1000, 1000, BLUE)]
  ]);
  const reads: string[] = [];
  const read = async (fileName: string) => {
    reads.push(fileName);
    return stored.get(fileName) ?? null;
  };

  const frames: JourneyFrame[] = [
    { fileName: 'red.jpg', caption: '13 Jan 2025' },
    { fileName: 'green.jpg', caption: '2 Apr 2025' },
    { fileName: 'blue.jpg', caption: '13 Aug 2025' }
  ];

  /* --- nothing is transmitted by generating -----------------------------
     A share sheet that counts calls, in place of the one this headless
     browser does not have. Everything below generates with it installed;
     the count is read after both outputs exist. */
  let shareCalls = 0;
  let sharedFile: { name: string; type: string; size: number } | null = null;
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: async (data: { files: File[] }) => {
      shareCalls += 1;
      sharedFile = { name: data.files[0].name, type: data.files[0].type, size: data.files[0].size };
    }
  });

  // --- the collage --------------------------------------------------------
  const progress: number[] = [];
  const collage = await renderCollage(frames, read, (done) => progress.push(done));
  const layout = collageLayout(frames.length);
  const collageBytes = new Uint8Array(await collage.arrayBuffer());

  result.collageType = collage.type;
  result.collageSignature = signature(collageBytes, 3);
  result.collageProgress = progress;
  result.readsWereFullPhotos = reads;

  const bitmap = await createImageBitmap(collage);
  result.collageSize = { width: bitmap.width, height: bitmap.height };
  result.expectedCollageSize = { width: layout.width, height: layout.height };
  bitmap.close();

  /* The centre of each cell, in reading order. Cell 0 must be the oldest
     photo. Cell 3 is past the end of a three-photo journey and must be the
     surround, not a repeat. */
  const cellCentre = async (index: number) => {
    const column = index % layout.columns;
    const row = Math.floor(index / layout.columns);
    return pixelAt(
      collage,
      layout.pad + column * (layout.cell + layout.gap) + layout.cell / 2,
      layout.pad + row * (layout.cell + layout.caption + layout.gap) + layout.cell / 2
    );
  };
  result.cellColours = [await cellCentre(0), await cellCentre(1), await cellCentre(2), await cellCentre(3)];

  /* A portrait photo in a square cell has to be cropped, not letterboxed:
     the top-left corner of cell 1 is inside the green photo, and would be
     the surround if the cell had been fitted instead of covered. */
  result.portraitCornerColour = await pixelAt(
    collage,
    layout.pad + (layout.cell + layout.gap) + 4,
    layout.pad + 4
  );
  result.coverOfPortrait = fitCover(800, 1200, layout.cell, layout.cell);

  // --- a photo whose file is gone ----------------------------------------
  const withMissing = await renderCollage(
    [...frames, { fileName: 'reclaimed-by-the-sweep.jpg', caption: '1 Sep 2025' }],
    read
  );
  const gapLayout = collageLayout(4);
  result.missingPhotoStillRendered = withMissing.size > 0;
  result.gapColour = await pixelAt(
    withMissing,
    gapLayout.pad + (gapLayout.cell + gapLayout.gap) + gapLayout.cell / 2,
    gapLayout.pad + (gapLayout.cell + gapLayout.caption + gapLayout.gap) + gapLayout.cell / 2
  );

  // --- the timelapse ------------------------------------------------------
  result.timelapseSupported = timelapseSupported();
  const startedAt = performance.now();
  const timelapse = await recordTimelapse(frames, read);
  result.recordingTookMs = Math.round(performance.now() - startedAt);
  const timelapseBytes = new Uint8Array(await timelapse.arrayBuffer());
  result.timelapseType = timelapse.type;
  // EBML, which is what a WebM file starts with.
  result.timelapseSignature = signature(timelapseBytes, 4);
  result.timelapseSize = timelapse.size;
  result.timelapseEdge = TIMELAPSE_EDGE;
  result.firstFrame = await firstVideoFrame(timelapse);

  // Both outputs are made, and nothing has been shared.
  result.shareCallsAfterGenerating = shareCalls;

  result.fileNames = {
    collage: journeyFileName('Alicja', 'collage', 20313),
    timelapse: journeyFileName('Alicja', 'timelapse', 20313)
  };

  /* Sharing is the separate step, and run.mjs clicks it: a share sheet
     needs a user gesture, which is the mechanism behind the ticket's claim
     rather than something the app chose to honour. */
  document.getElementById('share')!.addEventListener('click', () => {
    deliverBlob(journeyFileName('Alicja', 'collage', 20313), collage).then((delivery) => {
      (window as unknown as { __journeyShareResult: unknown }).__journeyShareResult = {
        delivery,
        shareCalls,
        sharedFile
      };
    });
  });

  (window as unknown as { __journeyProbeResult: unknown }).__journeyProbeResult = result;
  document.body.dataset.journeyProbeReady = 'true';
}

run().catch((err) => {
  (window as unknown as { __journeyProbeResult: unknown }).__journeyProbeResult = {
    error: String(err?.stack ?? err)
  };
  document.body.dataset.journeyProbeReady = 'true';
});
