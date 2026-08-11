/* Picking photos in an editor: the three steps ticket 11 left for ticket 08,
   in one place because both editors take them.

   Normalizing happens here rather than on save, so a file this app cannot
   read - HEIC, or something that is not an image at all - is refused while
   the picker is still the thing in front of the user, and so the tile can show
   what they actually chose. The bytes are stored when the entry or milestone
   is (ADR-0008: files land before the row that names them).

   It sits next to photoFiles.ts rather than in `data/`, for the same reason
   that one does: it reports failures by raising a toast, which is an app-level
   concern the data layer has no business knowing about. */

import { filePhotoPicker } from '../data/photos/picker';
import { normalizePhoto, UnsupportedImageError } from '../data/photos/normalize';
import type { NormalizedPhoto } from '../data/journal/photos';
import { toast } from './toasts.svelte';

/** A photo in an editor: one its owner already has, or one just picked and
    normalized but not yet stored. The two are not interchangeable - a stored
    photo is a row to keep or remove, a picked one is bytes to write. */
export type EditorPhoto =
  | { kind: 'stored'; photo: { id: string; fileName: string | null } }
  | { kind: 'picked'; photo: NormalizedPhoto };

const picker = filePhotoPicker();

/** Whatever the user chose, normalized and ready to store. Empty if they
    backed out, which is an ordinary outcome and not an error (picker.ts).
    Anything unreadable is reported to the user and left out of the result, so
    picking four photos of which one is a HEIC still returns the other three.

    `limit` caps how many are kept, for the one owner that holds a single
    photo: a milestone. */
export async function pickPhotos(limit?: number): Promise<NormalizedPhoto[]> {
  let picked: Uint8Array[];
  try {
    picked = await picker.pick();
  } catch (error) {
    console.error('the photo picker failed', error);
    toast("Couldn't open the photo picker.");
    return [];
  }

  const normalized: NormalizedPhoto[] = [];
  for (const bytes of limit == null ? picked : picked.slice(0, limit)) {
    try {
      normalized.push(await normalizePhoto(bytes));
    } catch (error) {
      // UnsupportedImageError carries a message written for the person who
      // picked the file; anything else is a bug and gets a plain one.
      toast(error instanceof UnsupportedImageError ? error.message : "That photo couldn't be read.");
    }
  }
  return normalized;
}
