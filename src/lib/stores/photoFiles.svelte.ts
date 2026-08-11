/* The one photo file store the UI reads, set once at boot.

   PhotoThumb renders wherever a photo appears - the timeline, the
   milestones list, the Progress grid - and threading a store through every
   one of those call sites would put a prop on components that have nothing
   to do with photos. So it sits here, next to bootState, which is the same
   arrangement ADR-0017 already uses for the journal: one app-level module
   constructs the real thing and the UI reads it.

   Not reactive: the store is set before the first screen renders and never
   replaced, so nothing needs to re-run when it changes. */

import { thumbFileName } from '../data/photos/names';
import type { PhotoFileStore } from '../data/journal/journal';

let store: PhotoFileStore | null = null;

export function usePhotoFiles(files: PhotoFileStore): void {
  store = files;
}

/** A stored photo's thumbnail bytes, or null when there is no store yet
    (server-side, or before boot finishes), no file, or the file is gone.
    Every one of those renders the placeholder, which is what the caller
    would do with an error anyway. */
export async function readThumbnail(fileName: string): Promise<Uint8Array | null> {
  return store ? store.read(thumbFileName(fileName)) : null;
}
