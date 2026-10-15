import type { NormalizedPhoto } from '../journal/photos';
import { isHeic } from './bytes';
import { UnsupportedImageError } from './normalize-pixels';
import type { NormalizeReply } from './normalize.worker';

export { MAX_EDGE, THUMB_EDGE, THUMB_QUALITY, UnsupportedImageError } from './normalize-pixels';

const HEIC_MESSAGE =
  "This looks like a HEIC photo, which this app can't read yet. Convert it to JPEG first, or set your camera to save photos as JPEG.";

/** A worker gives canvas encoding its own scheduler. On Android, encoding on
    an idle page can wait four seconds per image for an idle-task deadline. */
export async function normalizePhoto(bytes: Uint8Array): Promise<NormalizedPhoto> {
  if (isHeic(bytes)) throw new UnsupportedImageError('heic', HEIC_MESSAGE);

  const worker = new Worker(new URL('./normalize.worker.ts', import.meta.url), { type: 'module' });
  try {
    return await new Promise<NormalizedPhoto>((resolve, reject) => {
      worker.onmessage = ({ data }: MessageEvent<NormalizeReply>) => {
        if (data.ok) resolve(data.photo);
        else reject(data.kind ? new UnsupportedImageError(data.kind, data.error) : new Error(data.error));
      };
      worker.onerror = (event) => {
        event.preventDefault();
        reject(new Error(event.message || 'photo normalization worker failed'));
      };
      worker.onmessageerror = () => reject(new Error('photo normalization worker returned an unreadable message'));
      // The caller still owns the picked bytes; do not detach its buffer.
      worker.postMessage(bytes);
    });
  } finally {
    worker.terminate();
  }
}
