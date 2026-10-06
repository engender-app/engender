/* The one voice recording file store the UI reads, set at boot and cleared
   around a web lock the way photoFiles.ts's is -
   photoFiles.ts's arrangement, mirrored for recordings rather than reused
   directly: the two read different kinds of file (a recording has no
   thumbnail to derive a name from) even though both sit on the same
   underlying PhotoFileStore instance boot.svelte.ts constructs once. */

import type { PhotoFileStore } from '../data/journal/journal';

let store: PhotoFileStore | null = null;
let videoStore: PhotoFileStore | null = null;

export function setVoiceFiles(files: PhotoFileStore | null): void {
  store = files;
}

/** A stored recording's bytes, or null when there is no store yet, no
    file, or the file is gone - VoicePlayer.svelte treats all three the
    same way PhotoThumb treats a missing photo file. */
export async function readRecording(fileName: string): Promise<Uint8Array | null> {
  return store ? store.read(fileName) : null;
}

export function setVideoFiles(files: PhotoFileStore | null): void {
  videoStore = files;
}

/** A stored video note's bytes, or null when there is no store yet, no file,
    or the file is gone - VideoNotePlayer.svelte treats all three the way
    VoicePlayer treats a missing recording. */
export async function readVideoNote(fileName: string): Promise<Uint8Array | null> {
  return videoStore ? videoStore.read(fileName) : null;
}
