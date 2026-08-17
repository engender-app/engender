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

export function filePhotoPicker(): PhotoPicker {
  return {
    async pick() {
      if (isAndroid()) {
        const { images } = await androidPhotos.pickImages();
        return images.map(base64ToBytes);
      }

      // Whatever the OS decides matches "image/*", HEIC included: the bytes
      // still go through normalize(). An entry holds several photos, so one
      // trip through the dialog can bring back several.
      const files = await chooseFiles('image/*', { multiple: true });
      return Promise.all(files.map(async (file) => new Uint8Array(await file.arrayBuffer())));
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
      return file ? [new Uint8Array(await file.arrayBuffer())] : [];
    }
  };
}
