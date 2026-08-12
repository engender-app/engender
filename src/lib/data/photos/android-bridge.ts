import { registerPlugin } from '@capacitor/core';

export interface AndroidPhotosBridge {
  pickImages(): Promise<{ images: string[] }>;
  writeFile(options: { name: string; base64: string; directory?: string }): Promise<void>;
  readFile(options: { name: string; directory?: string }): Promise<{ base64: string | null }>;
  sizeFile(options: { name: string; directory?: string }): Promise<{ size: number | null }>;
  removeFile(options: { name: string; directory?: string }): Promise<void>;
  listFiles(options?: { directory?: string }): Promise<{ names: string[] }>;
}

export const androidPhotos = registerPlugin<AndroidPhotosBridge>('Photos');
