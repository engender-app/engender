/* Rewriting one photo file through the encrypting store (ticket 10).

   Photos are converted in place, under the names they already have, and
   only after the encrypted database has been verified - so the mixed window
   is one-way by design and there is nothing to go back to. What that costs
   is a way to tell, after a kill, which files an earlier attempt already
   did. The file itself answers: a name is its own additional authenticated
   data (encrypted-file-store.ts), so a file that decrypts under the data
   key was converted and a file that does not is still a photo. No progress
   list to keep in step with the disk, and nothing to go stale if the orphan
   sweep removes a file between the listing and the write.

   A kill during the write itself cannot leave half a file: OPFS writables
   land in a swap file and are moved into place by close(), so the name
   holds either the photo or its ciphertext. The Node tier's fake store
   behaves the same way, which is what makes the resume testable there. */

import type { PhotoFileStore } from '../journal/journal';
import { encryptedFileStore } from '../photos/encrypted-file-store';

export function makePhotoConverter(
  plain: PhotoFileStore,
  dataKey: Uint8Array<ArrayBuffer>
): (name: string) => Promise<void> {
  const encrypted = encryptedFileStore(plain, dataKey);

  /** True when the file decrypts under the data key, which only a file an
      earlier attempt wrote can do. A DecryptionFailedError is the ordinary
      answer here - it means the bytes are still a photo - so it is not
      worth distinguishing from a store that cannot read at all: the write
      below would hit that and report it properly. */
  const alreadyConverted = async (name: string): Promise<boolean> => {
    try {
      return (await encrypted.read(name)) !== null;
    } catch {
      return false;
    }
  };

  return async function convertPhoto(name: string): Promise<void> {
    if (await alreadyConverted(name)) return;
    const bytes = await plain.read(name);
    // Gone between the listing and now - the orphan sweep can do that, and
    // the row that named it is swept on a later boot (photos.ts).
    if (bytes === null) return;
    await encrypted.write(name, bytes);
  };
}
