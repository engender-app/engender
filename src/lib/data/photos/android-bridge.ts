import { androidPluginOwners, registerAndroidPlugin } from '$lib/android/plugin-registry';

interface AndroidPhotosBridge {
  /* A pick hands back tokens, not bytes: the bytes come afterwards over
     android-pick-channel.ts, or through readPickedChunk below on a WebView
     that cannot carry a structured clone. */
  /* `multiple` asks the system picker for several images in one trip, up to
     the platform's own limit; without it the picker hands back one. */
  pickImages(options?: { multiple?: boolean }): Promise<{ tokens: string[] }>;
  captureImage(): Promise<{ token: string | null }>;
  pickDocument(): Promise<{ token: string | null }>;
  /* One piece of a picked file per call, `done` on the last of them: a
     plugin response is one JSON string by construction, so a whole 25 MB
     scan through here would be a 34 MB allocation the heap can refuse.
picker.ts owns the loop. */
  readPickedChunk(options: { token: string }): Promise<{ base64: string; done: boolean }>;
  /* Native keeps a file it has just handed over under its token until the next
     pick, so a read that lost the race with a lock can be undone: the token
     is redeemable again (stores/pendingPick.ts). */
  reopenPicked(options: { token: string }): Promise<{ reopened: boolean }>;
  writeFile(options: { name: string; base64: string; directory?: string }): Promise<void>;
  sizeFile(options: { name: string; directory?: string }): Promise<{ size: number | null }>;
  sizeFiles(options: { names: string[]; directory?: string }): Promise<{ sizes: (number | null)[] }>;
  removeFile(options: { name: string; directory?: string }): Promise<void>;
  /* The reset's only caller: the directory and all in it. */
  removeDirectory(options?: { directory?: string }): Promise<void>;
  listFiles(options?: { directory?: string }): Promise<{ names: string[] }>;
  directoryPath(options?: { directory?: string }): Promise<{ path: string }>;
}

export const androidPhotos = registerAndroidPlugin<AndroidPhotosBridge>(androidPluginOwners.photos);
