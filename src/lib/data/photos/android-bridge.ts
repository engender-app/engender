import { androidPluginOwners, registerAndroidPlugin } from '$lib/android/plugin-registry';

interface AndroidPhotosBridge {
  /* A pick hands back tokens, not bytes: the bytes come afterwards over
     android-pick-channel.ts, or through readPickedChunk below on a WebView
     that cannot carry a structured clone (phase 9 audit ticket 06). */
  pickImages(): Promise<{ tokens: string[] }>;
  captureImage(): Promise<{ token: string | null }>;
  pickDocument(): Promise<{ token: string | null }>;
  /* One piece of a picked file per call, `done` on the last of them: a
     plugin response is one JSON string by construction, so a whole 25 MB
     scan through here would be a 34 MB allocation the heap can refuse
     (phase 9 audit ticket 14). picker.ts owns the loop. */
  readPickedChunk(options: { token: string }): Promise<{ base64: string; done: boolean }>;
  writeFile(options: { name: string; base64: string; directory?: string }): Promise<void>;
  sizeFile(options: { name: string; directory?: string }): Promise<{ size: number | null }>;
  sizeFiles(options: { names: string[]; directory?: string }): Promise<{ sizes: (number | null)[] }>;
  removeFile(options: { name: string; directory?: string }): Promise<void>;
  listFiles(options?: { directory?: string }): Promise<{ names: string[] }>;
  directoryPath(options?: { directory?: string }): Promise<{ path: string }>;
}

export const androidPhotos = registerAndroidPlugin<AndroidPhotosBridge>(androidPluginOwners.photos);
