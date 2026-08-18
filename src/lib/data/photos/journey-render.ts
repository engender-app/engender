/* Turning a photo journey into one file (ticket 27).

   The browser half of journey.ts: it needs a decoder, a canvas and - for
   the timelapse - MediaRecorder, so it is tested against a real Chromium in
   the browser tier rather than stubbed in Node, the same split normalize.ts
   already lives under.

   Both outputs read one photo at a time and let it go before the next. A
   three-year journey can be hundreds of photos and every stored one is up
   to 2048px on the long edge (ADR-0008), which is 16MB of bitmap each -
   decoding them all first would be the export that runs out of memory on
   the phone it matters on.

   Nothing here writes a file anywhere. It hands back a Blob and the screen
   decides what happens to it, which is the whole point of the ticket: the
   generated picture only leaves the device when a person does something
   about it. */

import {
  collageLayout,
  fitContain,
  fitCover,
  JOURNEY_MIME,
  TIMELAPSE_EDGE,
  TIMELAPSE_FPS,
  TIMELAPSE_MS_PER_PHOTO
} from './journey';

/** One photo's place in the export. The caption is already worded and
    formatted by the screen: dates read differently per locale and ADR-0016
    keeps paraglide out of anything the Node tier imports. */
export interface JourneyFrame {
  fileName: string;
  caption: string;
}

/** Full photo bytes by stored file name, or null when the file is gone -
    the demo persona's photos have no files, and so does one whose file the
    orphan sweep reclaimed. */
export type ReadPhoto = (fileName: string) => Promise<Uint8Array | null>;

/** Called after each photo is drawn, so a screen can show progress through
    an export that takes tens of seconds. */
export type JourneyProgress = (done: number, total: number) => void;

/* The exported picture does not follow the app's theme. Someone sharing a
   collage is sending a photograph, not a screenshot of their settings, and
   a file that came out dark because the phone was in dark mode that evening
   would be a surprise months later. Dark surround because that is what a
   contact sheet of photographs wants. */
const SURROUND = '#17151a';
const CAPTION_TEXT = '#f2eef5';
const MISSING_PHOTO = '#2b2830';

const COLLAGE_QUALITY = 0.86;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The photo decoded, or null if there are no bytes or they will not
    decode. A single unreadable photo leaves a gap in the export rather than
    failing all of it - the export is the wrong place to find out, and the
    other twenty photos are still worth having. */
async function decode(read: ReadPhoto, fileName: string): Promise<ImageBitmap | null> {
  const bytes = await read(fileName);
  if (!bytes) return null;
  try {
    return await createImageBitmap(new Blob([bytes as BlobPart]));
  } catch {
    return null;
  }
}

/** One cell: the photo cropped to the square from its centre, with its date
    on the strip underneath. */
function drawCell(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  bitmap: ImageBitmap | null,
  caption: string,
  box: { x: number; y: number; cell: number; caption: number; fontSize: number }
): void {
  if (bitmap) {
    const crop = fitCover(bitmap.width, bitmap.height, box.cell, box.cell);
    context.drawImage(bitmap, crop.sx, crop.sy, crop.sWidth, crop.sHeight, box.x, box.y, box.cell, box.cell);
  } else {
    context.fillStyle = MISSING_PHOTO;
    context.fillRect(box.x, box.y, box.cell, box.cell);
  }

  context.fillStyle = CAPTION_TEXT;
  context.font = `${box.fontSize}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(caption, box.x + box.cell / 2, box.y + box.cell + box.caption / 2, box.cell);
}

/** The whole journey as one JPEG contact sheet. */
export async function renderCollage(
  frames: JourneyFrame[],
  read: ReadPhoto,
  onProgress?: JourneyProgress
): Promise<Blob> {
  const layout = collageLayout(frames.length);
  const canvas = new OffscreenCanvas(layout.width, layout.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d canvas context to compose a collage with');

  context.fillStyle = SURROUND;
  context.fillRect(0, 0, layout.width, layout.height);

  for (const [index, frame] of frames.entries()) {
    const column = index % layout.columns;
    const row = Math.floor(index / layout.columns);
    const bitmap = await decode(read, frame.fileName);
    drawCell(context, bitmap, frame.caption, {
      x: layout.pad + column * (layout.cell + layout.gap),
      y: layout.pad + row * (layout.cell + layout.caption + layout.gap),
      cell: layout.cell,
      caption: layout.caption,
      fontSize: layout.fontSize
    });
    bitmap?.close();
    onProgress?.(index + 1, frames.length);
  }

  return canvas.convertToBlob({ type: JOURNEY_MIME.collage, quality: COLLAGE_QUALITY });
}

/* --- the timelapse -----------------------------------------------------

   MediaRecorder over a canvas capture stream, which records in real time:
   the video is as long as the loop below takes, and there is no way to
   render it faster than it plays without an encoder this app does not have.
   That is why the screen shows the duration up front (journey.ts) - it is
   the wait, not just the result.

   The canvas is a detached element rather than an OffscreenCanvas, because
   captureStream() is only on the DOM one. */

const VP8 = `${JOURNEY_MIME.timelapse};codecs=vp8`;

/** Whether this browser can record a timelapse at all, so the screen can
    offer only the collage instead of failing after a long wait. Chromium
    and the Android WebView can; Safari has no WebM encoder. */
export function timelapseSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(JOURNEY_MIME.timelapse);
}

/** Precondition: at least one frame. A timelapse of nothing is not a file
    the screen offers - the button is disabled until something is selected. */
export async function recordTimelapse(
  frames: JourneyFrame[],
  read: ReadPhoto,
  onProgress?: JourneyProgress
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = TIMELAPSE_EDGE;
  canvas.height = TIMELAPSE_EDGE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d canvas context to record a timelapse with');

  const paint = async (frame: JourneyFrame) => {
    context.fillStyle = SURROUND;
    context.fillRect(0, 0, TIMELAPSE_EDGE, TIMELAPSE_EDGE);
    const bitmap = await decode(read, frame.fileName);
    if (bitmap) {
      const fit = fitContain(bitmap.width, bitmap.height, TIMELAPSE_EDGE, TIMELAPSE_EDGE);
      context.drawImage(bitmap, fit.x, fit.y, fit.width, fit.height);
      bitmap.close();
    }
    context.fillStyle = CAPTION_TEXT;
    context.font = `${Math.round(TIMELAPSE_EDGE / 24)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    context.fillText(frame.caption, TIMELAPSE_EDGE / 2, TIMELAPSE_EDGE - TIMELAPSE_EDGE / 36, TIMELAPSE_EDGE);
  };

  // The first photo is on the canvas before recording starts, or the
  // opening frames of the video are the empty surround.
  await paint(frames[0]);

  const stream = canvas.captureStream(TIMELAPSE_FPS);
  const recorder = new MediaRecorder(stream, {
    mimeType: MediaRecorder.isTypeSupported(VP8) ? VP8 : JOURNEY_MIME.timelapse
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const finished = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  try {
    recorder.start();
    for (const [index, frame] of frames.entries()) {
      if (index > 0) await paint(frame);
      // Real time is the encoder's clock: this is how long the photo is on
      // screen and how long it lasts in the file.
      await delay(TIMELAPSE_MS_PER_PHOTO);
      onProgress?.(index + 1, frames.length);
    }
    recorder.stop();
    await finished;
  } finally {
    // Whatever happened, the capture track must not outlive this call.
    for (const track of stream.getTracks()) track.stop();
  }

  return new Blob(chunks, { type: JOURNEY_MIME.timelapse });
}
