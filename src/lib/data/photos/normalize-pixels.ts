/* Normalize bytes to JPEG and thumbnail (ADR-0008). Cap the long edge at 2048 px without
   upscaling. Decode with `imageOrientation: 'from-image'` before re-encoding through canvas
   so orientation stays in the pixels while EXIF, GPS and identifiers drop out. Test the
   pure helpers in Node and the decoder in Chromium. */

import type { NormalizedPhoto } from '../journal/photos';
import { judgeImage } from '../media/budget';

/** The long edge of a stored photo, and of its thumbnail. 2048 is
    ADR-0008's; the thumbnail is sized for the Progress grid at 2x, so
    that screen never decodes a full photo to draw a 104px tile. */
/* MAX_EDGE stays exported only for photos-probe.ts, which cross-checks against it. */
export const MAX_EDGE = 2048;
export const THUMB_EDGE = 320;

const FULL_QUALITY = 0.82;
/** Exported because a PDF's first page is encoded to the same shape by the
    renderer (documents/pdf.ts), rather than to a second thumbnail quality
    nobody chose. */
export const THUMB_QUALITY = 0.7;

/** A picked file this app will not store, with a message meant for the
    person who picked it. */
/** As with UnsupportedArchiveKind: the screen words its message from this,
    while the message itself is the English diagnostic for the console. */
type UnsupportedImageKind = 'heic' | 'unreadable' | 'too-many-pixels';

export class UnsupportedImageError extends Error {
  readonly kind: UnsupportedImageKind;

  constructor(kind: UnsupportedImageKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UnsupportedImageError';
    this.kind = kind;
  }
}

const UNREADABLE_MESSAGE = "This file isn't an image this app can read. Try a JPEG or PNG.";
const TOO_MANY_PIXELS_MESSAGE = 'This image declares more pixels than this app will decode.';

/** Judges the header before anything decodes: the declared size is what a
    decoder will allocate, whatever the file's own byte length is
    (media/budget.ts). Exported because the caller that owns the worker
    asks the same question before spawning one. */
export function refuseUndecodableImage(bytes: Uint8Array): void {
  const verdict = judgeImage(bytes);
  if (verdict === 'too-many-pixels') throw new UnsupportedImageError('too-many-pixels', TOO_MANY_PIXELS_MESSAGE);
  if (verdict === 'unreadable') throw new UnsupportedImageError('unreadable', UNREADABLE_MESSAGE);
}

export async function normalizePhotoPixels(bytes: Uint8Array): Promise<NormalizedPhoto> {
  refuseUndecodableImage(bytes);
  let source: ImageBitmap;
  try {
    source = await createImageBitmap(new Blob([bytes as BlobPart]), { imageOrientation: 'from-image' });
  } catch (cause) {
    // Not an image, truncated, or a format this browser build lacks - the
    // person who picked it can do the same thing about all three.
    throw new UnsupportedImageError('unreadable', UNREADABLE_MESSAGE, { cause });
  }

  try {
    return {
      full: await encodeScaled(source, MAX_EDGE, FULL_QUALITY),
      thumb: await encodeScaled(source, THUMB_EDGE, THUMB_QUALITY)
    };
  } finally {
    source.close();
  }
}

/** The bitmap drawn onto a canvas no larger than `maxEdge` on its long
    side, encoded as JPEG. Smaller images are left at their own size:
    upscaling would cost bytes and add nothing. */
async function encodeScaled(source: ImageBitmap, maxEdge: number, quality: number): Promise<Uint8Array> {
  const scale = Math.min(1, maxEdge / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d canvas context to normalize photos with');
  context.drawImage(source, 0, 0, width, height);

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  return new Uint8Array(await blob.arrayBuffer());
}
