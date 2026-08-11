/* The web PhotoFileStore: files in OPFS, in a directory of the app's own.

   The directory matters. SQLocal keeps the database file in the OPFS root,
   and the orphan sweep deletes everything it finds that no photo row
   references - pointed at the root, it would delete the database on the
   next boot. Photos get their own subdirectory so "everything here" is a
   safe thing for the sweep to ask.

   Names stay opaque and relative on both sides of the seam (names.ts):
   this adapter is the only code that knows what root they resolve
   against, which is what lets the Android adapter resolve the same names
   against the app-private directory later without anything above noticing. */

import type { PhotoFileStore } from '../journal/journal';

export const PHOTO_DIRECTORY = 'photos';

/** TypeScript's DOM lib describes FileSystemDirectoryHandle without the
    async iteration the File System Access API specifies, so listing a
    directory needs the method spelled out. Exported because the browser
    tier lists the OPFS root the same way. */
export type ListableDirectory = FileSystemDirectoryHandle & { keys(): AsyncIterableIterator<string> };

const isNotFound = (error: unknown): boolean => (error as DOMException)?.name === 'NotFoundError';

export function opfsPhotoFiles(directory = PHOTO_DIRECTORY): PhotoFileStore {
  const dir = async (): Promise<ListableDirectory> =>
    (await navigator.storage.getDirectory()).getDirectoryHandle(directory, {
      create: true
    }) as Promise<ListableDirectory>;

  return {
    async write(name, bytes) {
      const handle = await (await dir()).getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      try {
        await writable.write(bytes as unknown as BufferSource);
      } finally {
        await writable.close();
      }
    },

    async read(name) {
      try {
        const handle = await (await dir()).getFileHandle(name);
        return new Uint8Array(await (await handle.getFile()).arrayBuffer());
      } catch (error) {
        // A missing file is an answer, not a failure: the sweep may have
        // reclaimed it, or the row may be from an archive whose files did
        // not arrive. The screen falls back to the placeholder.
        if (isNotFound(error)) return null;
        throw error;
      }
    },

    async remove(name) {
      try {
        await (await dir()).removeEntry(name);
      } catch (error) {
        // Removing what is not there is the state the caller wanted, and
        // both deleteEntry and the sweep rely on that being quiet.
        if (!isNotFound(error)) throw error;
      }
    },

    async list() {
      const names: string[] = [];
      for await (const name of (await dir()).keys()) names.push(name);
      return names;
    }
  };
}
