/* Choosing a photo to add.

   One seam, two platforms. On the web this is a file input; on Android it
   is Capacitor's photo picker, which hands back the one photo the user
   chose without ever asking for the read-the-whole-gallery permission
   (ticket 11). The Android half lands with the shell - what matters now is
   that the call sites above never learn which one they got.

   Bytes, not File objects or URIs: a File is a web type and a content://
   URI is an Android one, and normalize() takes neither. */

import { chooseFiles } from '../fileDialog';
import { isAndroid } from '../../platform';
import { androidPhotos } from './android-bridge';
import { refuseAboveCeiling, refuseTooLarge } from '../documents/accept';

export interface PhotoPicker {
  /** The bytes of everything the user chose, or an empty array if they
      backed out. Cancelling is an ordinary outcome, not an error. */
  pick(): Promise<Uint8Array[]>;
}

// What the Android bridge hands back for a photo: base64, because that is
// what crosses the bridge as JSON.
function base64ToBytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** Runs an Android bridge pick, turning the native side's own too-large
    refusal into the same DocumentRefusedError the web ceiling check throws
    - PhotosPlugin.java queries the content provider's declared size and
    rejects before it ever opens the file, the same "before it is read" this
    ceiling means on the web. Anything else the bridge rejects with is
    rethrown unchanged. */
async function pickOnAndroid<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof Error && error.message.includes('too-large')) refuseTooLarge();
    throw error;
  }
}

export function filePhotoPicker(): PhotoPicker {
  return {
    async pick() {
      if (isAndroid()) {
        const { images } = await pickOnAndroid(() => androidPhotos.pickImages());
        return images.map(base64ToBytes);
      }

      // Whatever the OS decides matches "image/*", HEIC included: the bytes
      // still go through normalize(). An entry holds several photos, so one
      // trip through the dialog can bring back several.
      const files = await chooseFiles('image/*', { multiple: true });
      // Every file's size is checked before any of them is read, so one
      // oversized photo in a multi-pick refuses the batch before the others
      // are read too - not partway through it.
      for (const file of files) refuseAboveCeiling(file.size);
      return Promise.all(files.map(async (file) => new Uint8Array(await file.arrayBuffer())));
    }
  };
}

/** A document to file, one at a time - PDF or image (ticket 54). Same split
    as filePhotoPicker(): Capacitor's native `ACTION_OPEN_DOCUMENT` pick on
    Android, so a document never takes the WebView file input's crash path
    (ticket 66); the same web file input elsewhere. Bytes only, same as
    every other picker here - accept.ts is what tells a PDF from an image. */
export function documentPicker(): PhotoPicker {
  return {
    async pick() {
      if (isAndroid()) {
        const { bytes } = await pickOnAndroid(() => androidPhotos.pickDocument());
        return bytes ? [base64ToBytes(bytes)] : [];
      }

      const [file] = await chooseFiles('application/pdf,image/*');
      if (!file) return [];
      refuseAboveCeiling(file.size);
      return [new Uint8Array(await file.arrayBuffer())];
    }
  };
}

/** Bytes straight from the device camera rather than the gallery, one shot
    at a time. Same PhotoPicker shape as above, so photoPicking.ts's
    normalize step doesn't need to know which one supplied the bytes.

    On Android this is android-bridge.ts's captureImage(), which opens the
    camera app through an implicit intent with no output URI - nothing is
    ever written to MediaStore, so there is no gallery write to undo. On the
    web, the file input's `capture` hint opens the device camera instead of
    the usual chooser (ticket 12). */
export function cameraPhotoPicker(): PhotoPicker {
  return {
    async pick() {
      if (isAndroid()) {
        const { image } = await androidPhotos.captureImage();
        return image ? [base64ToBytes(image)] : [];
      }

      const [file] = await chooseFiles('image/*', { capture: 'environment' });
      if (!file) return [];
      refuseAboveCeiling(file.size);
      return [new Uint8Array(await file.arrayBuffer())];
    }
  };
}
