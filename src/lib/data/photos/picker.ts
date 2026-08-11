/* Choosing a photo to add.

   One seam, two platforms. On the web this is a file input; on Android it
   is Capacitor's photo picker, which hands back the one photo the user
   chose without ever asking for the read-the-whole-gallery permission
   (ticket 11). The Android half lands with the shell - what matters now is
   that the call sites above never learn which one they got.

   Bytes, not File objects or URIs: a File is a web type and a content://
   URI is an Android one, and normalize() takes neither. */

export interface PhotoPicker {
  /** The bytes of everything the user chose, or an empty array if they
      backed out. Cancelling is an ordinary outcome, not an error. */
  pick(): Promise<Uint8Array[]>;
}

export function filePhotoPicker(): PhotoPicker {
  return {
    pick() {
      return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        // A hint to the file dialog, not a guarantee: the bytes still go
        // through normalize(), because this accepts whatever the OS
        // decides matches, HEIC included.
        input.accept = 'image/*';
        // An entry holds several photos, so one trip through the picker
        // can bring back several.
        input.multiple = true;

        const done = (result: Uint8Array[] | Error) => {
          input.remove();
          if (result instanceof Error) reject(result);
          else resolve(result);
        };

        input.addEventListener('change', () => {
          const files = [...(input.files ?? [])];
          Promise.all(files.map(async (file) => new Uint8Array(await file.arrayBuffer())))
            .then(done)
            .catch(done);
        });
        // Chromium fires this when the dialog is dismissed; without it the
        // promise would never settle and the caller's spinner would hang.
        input.addEventListener('cancel', () => done([]));

        input.style.display = 'none';
        document.body.append(input);
        input.click();
      });
    }
  };
}
