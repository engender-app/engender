import { androidPluginOwners, registerAndroidPlugin } from '$lib/android/plugin-registry';

export interface AndroidPhotosBridge {
  /* A pick hands back tokens, not bytes: the bytes come afterwards over
     android-pick-channel.ts, or through readPickedBase64 below on a WebView
     that cannot carry a structured clone (phase 9 audit ticket 06). */
  pickImages(): Promise<{ tokens: string[] }>;
  captureImage(): Promise<{ token: string | null }>;
  pickDocument(): Promise<{ token: string | null }>;
  readPickedBase64(options: { token: string }): Promise<{ base64: string }>;
  writeFile(options: { name: string; base64: string; directory?: string }): Promise<void>;
  sizeFile(options: { name: string; directory?: string }): Promise<{ size: number | null }>;
  sizeFiles(options: { names: string[]; directory?: string }): Promise<{ sizes: (number | null)[] }>;
  removeFile(options: { name: string; directory?: string }): Promise<void>;
  listFiles(options?: { directory?: string }): Promise<{ names: string[] }>;
  directoryPath(options?: { directory?: string }): Promise<{ path: string }>;
}

export const androidPhotos = registerAndroidPlugin<AndroidPhotosBridge>(androidPluginOwners.photos);
