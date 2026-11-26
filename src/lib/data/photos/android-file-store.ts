/* Store opaque relative names through the Android Photos plugin.
   Read binary files through Capacitor's local server to bypass JSON.
   The server only serves files, so write ArrayBuffers through a
   WebMessageListener. On older WebViews without
   window.androidPhotoWriteChannel, use the base64 bridge (ADR-0023). */

import { Capacitor } from '@capacitor/core';
import type { PhotoFileStore } from '../journal/journal';
import { androidPhotos } from './android-bridge';
import { PhotoChannelTimeoutError } from './channel-timeout';
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
        try {
          await viaChannel;
          return;
        } catch (error) {
          if (!(error instanceof PhotoChannelTimeoutError)) throw error;
        }
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
