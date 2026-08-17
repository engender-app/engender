/* The Android PhotoFileStore (ticket 12): app-private files through the
   local Photos plugin. Names stay opaque and relative exactly as on web.

   Reads fetch from Capacitor's local server, which keeps the bytes binary
   from disk to Uint8Array and is bound by the disk rather than by the
   bridge (ticket 07) - a plugin response crosses into the WebView as a JSON
   string, and on a Pixel 10a that crossing moved photo bytes at 0.8MB/s
   however they were batched, which made a decade of photos take seven
   minutes to read for an Archive export.

   Writes measured the same 0.8MB/s (ticket 17: an archive restore writing
   750 files spent 97% of its time in this call), because the local server
   only serves files - it has no matching path for the WebView to hand bytes
   back in. `writeOverChannel` is that path's own fix: a WebMessageListener
   carries the bytes across as a structured-clone ArrayBuffer, which never
   becomes a JSON string (ticket 19). Below the WebView versions that carry
   it, `window.androidPhotoWriteChannel` does not exist and this falls back
   to the base64 bridge call exactly as it always has - the same shape as
   `Object.hasOwn` and `crypto.randomUUID`'s fallbacks (ADR-0023). */

import { Capacitor } from '@capacitor/core';
import type { PhotoFileStore } from '../journal/journal';
import { androidPhotos } from './android-bridge';
import { writeOverChannel } from './android-write-channel';

const BASE64_CHUNK = 0x8000;

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK));
  }
  return btoa(binary);
};

export function appPrivatePhotoFiles(directory = 'photos'): PhotoFileStore {
  /* Asked once and reused. The directory is fixed for the life of the store,
     so this is one bridge call rather than one per read - and the memo is a
     promise rather than a path so concurrent first reads share it instead of
     racing to ask twice. */
  let directoryUrl: Promise<string> | null = null;
  const urlFor = async (name: string): Promise<string> => {
    /* A failure is not memoised. The plugin creates the directory on demand,
       and that can fail for reasons that pass - no space, or storage still
       locked before first unlock - so a later read gets to ask again. */
    directoryUrl ??= androidPhotos
      .directoryPath({ directory })
      .then(({ path }) => Capacitor.convertFileSrc(path))
      .catch((error: unknown) => {
        directoryUrl = null;
        throw error;
      });
    return `${await directoryUrl}/${encodeURIComponent(name)}`;
  };

  /* 404 is a photo that is not there, which is a null rather than a throw -
     the orphan sweep and a half-finished import both leave rows whose file
     has gone, and read() has always answered null for them. */
  const fetchOne = async (name: string): Promise<Uint8Array<ArrayBuffer> | null> => {
    const response = await fetch(await urlFor(name));
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer()) as Uint8Array<ArrayBuffer>;
  };

  return {
    async write(name, bytes) {
      const viaChannel = writeOverChannel(name, directory, bytes);
      if (viaChannel) {
        await viaChannel;
        return;
      }
      await androidPhotos.writeFile({ name, base64: toBase64(bytes), directory });
    },
    async read(name) {
      return fetchOne(name);
    },
    /* In parallel rather than in sequence: these are fetches over the local
       server, not bridge calls behind the plugin's queue, so the disk gets to
       answer several at once. */
    async readMany(names) {
      if (names.length === 0) return [];
      return Promise.all(names.map(fetchOne));
    },
    async size(name) {
      const { size } = await androidPhotos.sizeFile({ name, directory });
      return size;
    },
    async sizeMany(names) {
      if (names.length === 0) return [];
      const { sizes } = await androidPhotos.sizeFiles({ names, directory });
      return sizes;
    },
    async remove(name) {
      await androidPhotos.removeFile({ name, directory });
    },
    async list() {
      const { names } = await androidPhotos.listFiles({ directory });
      return names;
    }
  };
}
