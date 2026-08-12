/* The Android PhotoFileStore (ticket 12): app-private files through the
   local Photos plugin. Names stay opaque and relative exactly as on web. */

import type { PhotoFileStore } from '../journal/journal';
import { androidPhotos } from './android-bridge';

const BASE64_CHUNK = 0x8000;

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK));
  }
  return btoa(binary);
};

const fromBase64 = (text: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes as Uint8Array<ArrayBuffer>;
};

export function appPrivatePhotoFiles(directory = 'photos'): PhotoFileStore {
  return {
    async write(name, bytes) {
      await androidPhotos.writeFile({ name, base64: toBase64(bytes), directory });
    },
    async read(name) {
      const { base64 } = await androidPhotos.readFile({ name, directory });
      return base64 == null ? null : fromBase64(base64);
    },
    async size(name) {
      const { size } = await androidPhotos.sizeFile({ name, directory });
      return size;
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
