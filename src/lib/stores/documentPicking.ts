/* Picking a document to file (phase 8 features tickets 53 and 54,
   ADR-0065): one file, PDF or image, refused and reported the way
   photoPicking.ts already does for photos - accepting happens here, before
   the import sheet is the thing in front of the user, so a file this app
   will not store never gets as far as asking for a title.

   The platform split - Capacitor's native `ACTION_OPEN_DOCUMENT` pick on
   Android, the WebView file input elsewhere - lives in documentPicker()
   (data/photos/picker.ts), the same seam filePhotoPicker() already makes
   for photos. This module never learns which one ran. */

import { m } from '$lib/paraglide/messages';
import { acceptDocumentFile, DocumentRefusedError, type DocumentFile } from '../data/documents/accept';
import { documentPicker } from '../data/photos/picker';
import { UnsupportedImageError } from '../data/photos/normalize';
import { toast } from './toasts.svelte';

const picker = documentPicker();

/** Whatever the user chose, accepted and ready to store - or null if they
    backed out or the file was refused, both reported the same way
    pickPhotos() reports them: a toast naming what happened, nothing
    thrown past this point. */
export async function pickDocument(): Promise<DocumentFile | null> {
  let files: Uint8Array[];
  try {
    files = await picker.pick();
  } catch (error) {
    console.error('the document picker failed', error);
    toast(m.document_picker_failed());
    return null;
  }

  const [bytes] = files;
  if (!bytes) return null;

  try {
    return await acceptDocumentFile(bytes);
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
