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
import {
  acceptDocumentFile,
  DocumentRefusedError,
  type DocumentFile,
  type DocumentRefusalKind
} from '../data/documents/accept';
import { androidPickedBytes, documentPicker, PickDeferredError } from '../data/photos/picker';
import { claimPending, holdPending, type ClaimBy } from './pendingPick';
import { isSessionLocked } from './lock.svelte';
import { UnsupportedImageError } from '../data/photos/normalize';
import { toast } from './toasts.svelte';

const picker = documentPicker({ deferIf: isSessionLocked });

/** DocumentRefusedError's own two messages, by kind - shared by both catch
    blocks below, which reach a DocumentRefusedError by two different
    routes (the picker's own ceiling, and acceptDocumentFile()'s). */
function toastDocumentRefusal(kind: DocumentRefusalKind): void {
  toast(kind === 'too-large' ? m.document_too_large() : m.document_unsupported_file());
}

/** Whatever the user chose, accepted and ready to store - or null if they
    backed out or the file was refused, both reported the same way
    pickPhotos() reports them: a toast naming what happened, nothing
    thrown past this point. */
export async function pickDocument(claimBy?: ClaimBy): Promise<DocumentFile | null> {
  let files: Uint8Array[];
  try {
    files = await picker.pick();
  } catch (error) {
    if (error instanceof PickDeferredError) {
      // The screen that asked is gone: keep the token for the unlock, or say it cannot be kept.
      if (claimBy) holdPending(claimBy, location.pathname, error.tokens);
      else toast(m.picked_while_locked_lost());
    } else if (error instanceof DocumentRefusedError) {
      toastDocumentRefusal(error.kind);
    } else {
      console.error('the document picker failed', error);
      toast(m.picker_failed());
    }
    return null;
  }

  const [bytes] = files;
  if (!bytes) return null;
  return acceptPickedDocument(bytes);
}

/** The file a pick left for the documents screen while the app was locked. */
export async function claimPendingDocument(canUse: () => boolean = () => true): Promise<DocumentFile | null> {
  if (!canUse()) return null;
  const [token] = claimPending('document', location.pathname) ?? [];
  if (!token) return null;
  let bytes: Uint8Array;
  try {
    bytes = await androidPickedBytes(token);
  } catch (error) {
    console.error('a document kept through a lock could not be read', error);
    toast(m.picker_failed());
    return null;
  }
  const document = await acceptPickedDocument(bytes);
  if (document) toast(m.picked_while_locked_added());
  return document;
}

async function acceptPickedDocument(bytes: Uint8Array): Promise<DocumentFile | null> {
  try {
    return await acceptDocumentFile(bytes);
  } catch (error) {
    if (error instanceof UnsupportedImageError) {
      // Only 'heic' ever reaches here unwrapped (documents/accept.ts) -
      // the same wording the photo picker shows for the same file.
      toast(m.photo_heic());
    } else if (error instanceof DocumentRefusedError) {
      toastDocumentRefusal(error.kind);
    } else {
      console.error('a picked document could not be read', error);
      toast(m.document_unsupported_file());
    }
    return null;
  }
}
