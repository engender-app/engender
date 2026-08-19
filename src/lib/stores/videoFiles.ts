/* The one video note file store the UI reads, set once at boot -
   voiceFiles.ts's arrangement, mirrored for video notes rather than reused:
   the two read different kinds of file even though both sit on the same
   underlying PhotoFileStore instance boot.svelte.ts constructs once, and a
   reader named for what it reads is what keeps a caller from playing one as
   the other. */

import type { PhotoFileStore } from '../data/journal/journal';

let store: PhotoFileStore | null = null;

export function setVideoFiles(files: PhotoFileStore): void {
  store = files;
}

/** A stored video note's bytes, or null when there is no store yet, no file,
    or the file is gone - VideoNotePlayer.svelte treats all three the way
    VoicePlayer treats a missing recording. */
export async function readVideoNote(fileName: string): Promise<Uint8Array | null> {
  return store ? store.read(fileName) : null;
}
