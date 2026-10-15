import type { NormalizedPhoto } from '../journal/photos';
import { normalizePhotoPixels, UnsupportedImageError } from './normalize-pixels';

export type NormalizeReply =
  | { ok: true; photo: NormalizedPhoto }
  | { ok: false; error: string; kind?: UnsupportedImageError['kind'] };

onmessage = async ({ data }: MessageEvent<Uint8Array>) => {
  try {
    const photo = await normalizePhotoPixels(data);
    postMessage({ ok: true, photo } satisfies NormalizeReply, { transfer: [photo.full.buffer, photo.thumb.buffer] });
  } catch (error) {
    const reply: NormalizeReply = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      kind: error instanceof UnsupportedImageError ? error.kind : undefined
    };
    postMessage(reply);
  }
};
