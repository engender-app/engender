import { androidPluginOwners, registerAndroidPlugin } from '$lib/android/plugin-registry';

export interface AndroidPhotosBridge {
  pickImages(): Promise<{ images: string[] }>;
  captureImage(): Promise<{ image: string | null }>;
  writeFile(options: { name: string; base64: string; directory?: string }): Promise<void>;
  sizeFile(options: { name: string; directory?: string }): Promise<{ size: number | null }>;
  sizeFiles(options: { names: string[]; directory?: string }): Promise<{ sizes: (number | null)[] }>;
  removeFile(options: { name: string; directory?: string }): Promise<void>;
  listFiles(options?: { directory?: string }): Promise<{ names: string[] }>;
  directoryPath(options?: { directory?: string }): Promise<{ path: string }>;
}

export const androidPhotos = registerAndroidPlugin<AndroidPhotosBridge>(androidPluginOwners.photos);
