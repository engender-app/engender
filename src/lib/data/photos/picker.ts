/* Choosing a photo to add.

   One seam, two platforms. On the web this is a file input; on Android it
   is Capacitor's photo picker, which hands back the one photo the user
   chose without ever asking for the read-the-whole-gallery permission
   (ticket 11). The Android half lands with the shell - what matters now is
   that the call sites above never learn which one they got.

   Bytes, not File objects or URIs: a File is a web type and a content://
   URI is an Android one, and normalize() takes neither. */

import { chooseFiles } from '../fileDialog';

export interface PhotoPicker {
  /** The bytes of everything the user chose, or an empty array if they
      backed out. Cancelling is an ordinary outcome, not an error. */
  pick(): Promise<Uint8Array[]>;
}

export function filePhotoPicker(): PhotoPicker {
  return {
    async pick() {
      // Whatever the OS decides matches "image/*", HEIC included: the bytes
      // still go through normalize(). An entry holds several photos, so one
      // trip through the dialog can bring back several.
      const files = await chooseFiles('image/*', { multiple: true });
      return Promise.all(files.map(async (file) => new Uint8Array(await file.arrayBuffer())));
    }
  };
}
