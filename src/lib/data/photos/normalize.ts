/* Normalizing a picked photo (ADR-0008, ADR-0015).

   One function, one input (the raw bytes), one output (JPEG bytes plus a
   thumbnail). It knows nothing about where the bytes came from or where
   they are going, which is what lets the same call serve the web file
   input, the Android picker and ticket 14's import.

   Everything ADR-0008 and ADR-0015 ask for falls out of one decode and one
   re-encode:

     - Re-encoded to JPEG, so the 4-12MB the camera produced does not go
       into every future archive.
     - Capped at 2048px on the long edge, never upscaled.
     - All metadata gone. Not stripped tag by tag - a canvas has no way to
       carry EXIF through, so re-encoding through one is what drops GPS,
       device identifiers and the rest.
     - Orientation baked into the pixels, because the decode asks for
       imageOrientation: 'from-image'. It has to happen in this order: the
       rotation is applied while decoding, and the tag that described it is
       gone by the time the canvas is encoded. Skip it and every photo an
       iPhone took sideways stores sideways.

   This is browser-only - it needs a decoder and a canvas - so the Node
   tier tests the pieces that are pure (bytes.ts) and the browser tier
   tests this against a real Chromium. */

import { isHeic } from './bytes';
import type { NormalizedPhoto } from '../journal/photos';

/** The long edge of a stored photo, and of its thumbnail. 2048 is
    ADR-0008's; the thumbnail is sized for the Progress grid at 2x, so
    that screen never decodes a full photo to draw a 104px tile. */
export const MAX_EDGE = 2048;
export const THUMB_EDGE = 320;

const FULL_QUALITY = 0.82;
const THUMB_QUALITY = 0.7;

/** A picked file this app will not store, with a message meant for the
    person who picked it. */
export class UnsupportedImageError extends Error {
  /* As with UnsupportedArchiveError: `kind` is what the screen words its
     message from, `message` is the English diagnostic for the console. */
  readonly kind: 'heic' | 'unreadable';

  constructor(kind: 'heic' | 'unreadable', message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UnsupportedImageError';
    this.kind = kind;
  }
}

const HEIC_MESSAGE =
  "This looks like a HEIC photo, which this app can't read yet. Convert it to JPEG first, or set your camera to save photos as JPEG.";

const UNREADABLE_MESSAGE = "This file isn't an image this app can read. Try a JPEG or PNG.";

export async function normalizePhoto(bytes: Uint8Array): Promise<NormalizedPhoto> {
  // The one format checked ahead of the decoder, because Chromium cannot
  // decode it and it deserves a message that says what to do (bytes.ts).
  // Everything else the decoder gets to try.
  if (isHeic(bytes)) throw new UnsupportedImageError('heic', HEIC_MESSAGE);

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
