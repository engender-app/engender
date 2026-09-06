/* Picking a document to file (phase 8 features ticket 53, ADR-0065): one
   file, PDF or image, refused and reported the way photoPicking.ts already
   does for photos - accepting happens here, before the import sheet is
   the thing in front of the user, so a file this app will not store never
   gets as far as asking for a title.

   Web only for now. ADR-0065's own consequence - a native
   `ACTION_OPEN_DOCUMENT` pick on Android - is ticket 54's; until that
   lands Android goes through the same WebView file input every other
   picker not yet moved to the shell does, exactly as ticket 52 left it. */

import { chooseFiles } from '../data/fileDialog';
import { m } from '$lib/paraglide/messages';
import { acceptDocumentFile, DocumentRefusedError, type DocumentFile } from '../data/documents/accept';
import { UnsupportedImageError } from '../data/photos/normalize';
import { toast } from './toasts.svelte';

const ACCEPT = 'application/pdf,image/*';

/** Whatever the user chose, accepted and ready to store - or null if they
    backed out or the file was refused, both reported the same way
    pickPhotos() reports them: a toast naming what happened, nothing
    thrown past this point. */
export async function pickDocument(): Promise<DocumentFile | null> {
  let files: File[];
  try {
    files = await chooseFiles(ACCEPT);
  } catch (error) {
    console.error('the document picker failed', error);
    toast(m.document_picker_failed());
    return null;
  }

  const [file] = files;
  if (!file) return null;

  try {
    return await acceptDocumentFile(new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    if (error instanceof UnsupportedImageError) {
      // Only 'heic' ever reaches here unwrapped (documents/accept.ts) -
      // the same wording the photo picker shows for the same file.
      toast(m.photo_heic());
    } else if (error instanceof DocumentRefusedError) {
      toast(error.kind === 'too-large' ? m.document_too_large() : m.document_unsupported_file());
    } else {
      console.error('a picked document could not be read', error);
      toast(m.document_unsupported_file());
    }
    return null;
  }
}
