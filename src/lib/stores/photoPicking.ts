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

import { cameraPhotoPicker, filePhotoPicker } from '../data/photos/picker';
import { m } from '$lib/paraglide/messages';
import { normalizePhoto, UnsupportedImageError } from '../data/photos/normalize';
import { DocumentRefusedError } from '../data/documents/accept';
import type { NormalizedPhoto } from '../data/journal/photos';
import { toast } from './toasts.svelte';

/** A photo in an editor: one its owner already has, or one just picked and
    normalized but not yet stored. The two are not interchangeable - a stored
    photo is a row to keep or remove, a picked one is bytes to write. */
export type EditorPhoto =
  | { kind: 'stored'; photo: { id: string; fileName: string | null; starred: boolean } }
  | { kind: 'picked'; photo: NormalizedPhoto };

/** The default comparison photo a screen hands the post-capture review
    (ticket 12): a stored photo's file name, or the bytes of one already
    picked in this same editing session and not yet written to disk - the
    same stored/picked split EditorPhoto draws, for the same reason. */
export type ReferencePhoto = { fileName: string } | { bytes: Uint8Array };

const picker = filePhotoPicker();
const camera = cameraPhotoPicker();

/** Normalizes whatever bytes a picker returned, dropping and reporting
    anything unreadable so picking four photos of which one is a HEIC still
    returns the other three. Shared by pickPhotos and capturePhoto - both
    hand off to the same seam once bytes exist, regardless of source. */
async function normalizeAll(picked: Uint8Array[]): Promise<NormalizedPhoto[]> {
  const normalized: NormalizedPhoto[] = [];
  for (const bytes of picked) {
    try {
      normalized.push(await normalizePhoto(bytes));
    } catch (error) {
      /* UnsupportedImageError says which of the two refusals this is, and
         the wording comes from the catalogue rather than from the error, so
         a Polish reader gets a Polish sentence. Anything else is a bug and
         gets the plain one. */
      if (error instanceof UnsupportedImageError) {
        toast(error.kind === 'heic' ? m.photo_heic() : m.photo_not_an_image());
      } else {
        console.error('a picked photo could not be normalized', error);
        toast(m.photo_unreadable());
      }
    }
  }
  return normalized;
}

/** Whatever the user chose, normalized and ready to store. Empty if they
    backed out, which is an ordinary outcome and not an error (picker.ts).

    `limit` caps how many are kept, for the one owner that holds a single
    photo: a milestone. */
export async function pickPhotos(limit?: number): Promise<NormalizedPhoto[]> {
  let picked: Uint8Array[];
  try {
    picked = await picker.pick();
  } catch (error) {
    if (error instanceof DocumentRefusedError) {
      toast(m.document_too_large());
    } else {
      console.error('the photo picker failed', error);
      toast(m.photo_picker_failed());
    }
    return [];
  }

  return normalizeAll(limit == null ? picked : picked.slice(0, limit));
}

/** One shot from the device camera, normalized and ready to store. Null if
    the user backed out of the camera app, which is an ordinary outcome and
    not an error - same as an empty pickPhotos() result. */
export async function capturePhoto(): Promise<NormalizedPhoto | null> {
  let picked: Uint8Array[];
  try {
    picked = await camera.pick();
  } catch (error) {
    if (error instanceof DocumentRefusedError) {
      toast(m.document_too_large());
    } else {
      console.error('the camera failed', error);
      toast(m.photo_picker_failed());
    }
    return null;
  }

  const [photo] = await normalizeAll(picked);
  return photo ?? null;
}
