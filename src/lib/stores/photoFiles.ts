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

export function setPhotoFiles(files: PhotoFileStore): void {
  store = files;
}

/* Thumbnail reads asked for in the same turn of the event loop leave as
   one `readMany` (phase 5 audit ticket 03, finding 04).

   A grid mounts one PhotoThumb per photo and every one of them starts its
   own read, so before this the screen issued as many round trips as there
   were tiles - each of them a decrypt of its own under the encrypting
   store. The queue is here rather than in the component because the
   timeline, the milestone list and the editors all read through
   readThumbnail too, and a batch that only the photo grid could reach
   would be a batch three screens still went without. */
type Waiter = {
  resolve(bytes: Uint8Array | null): void;
  reject(error: unknown): void;
};

let pending = new Map<string, Waiter[]>();
let scheduled = false;

function enqueue(name: string): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    const waiting = pending.get(name);
    // Two tiles showing the same photo wait on one read rather than two.
    if (waiting) waiting.push({ resolve, reject });
    else pending.set(name, [{ resolve, reject }]);
    if (scheduled) return;
    scheduled = true;
    /* A microtask, not a frame: Svelte runs a render's effects in one
       synchronous flush, so everything that mounted together is already
       in the map by the time this runs - and unlike an animation frame it
       still fires in a tab nobody is looking at. */
    queueMicrotask(flush);
  });
}

async function flush(): Promise<void> {
  const batch = pending;
  const files = store;
  pending = new Map();
  scheduled = false;
  const names = [...batch.keys()];

  const settle = (name: string, bytes: Uint8Array | null) => {
    for (const waiter of batch.get(name)!) waiter.resolve(bytes);
  };
  const fail = (name: string, error: unknown) => {
    for (const waiter of batch.get(name)!) waiter.reject(error);
  };

  if (!files) {
    for (const name of names) settle(name, null);
    return;
  }

  const readEach = () =>
    Promise.all(
      names.map((name) =>
        files.read(name).then(
          (bytes) => settle(name, bytes),
          (error) => fail(name, error)
        )
      )
    );

  if (!files.readMany) {
    await readEach();
    return;
  }

  try {
    const read = await files.readMany(names);
    names.forEach((name, i) => settle(name, read[i] ?? null));
  } catch {
    /* readMany rejects as a whole, and a file that was tampered with or
       written under another key throws rather than reading as null
       (encrypted-file-store). Reading the batch again one name at a time
       costs a second pass over what is by then a known-bad batch, and
       keeps one unreadable photo to one placeholder instead of blanking
       every tile that happened to load beside it. */
    await readEach();
  }
}

/** A stored photo's thumbnail bytes, or null when there is no store yet
    (server-side, or before boot finishes), no file, or the file is gone.
    Every one of those renders the placeholder, which is what the caller
    would do with an error anyway. */
export async function readThumbnail(fileName: string): Promise<Uint8Array | null> {
  return enqueue(thumbFileName(fileName));
}

/** The same read, for a thumbnail whose name the caller has already worked
    out. A document is the one owner that needs it: a PDF's page is named
    off its own `.pdf` (journal/documents.ts's `documentThumbName`), and
    asking for it through `readThumbnail` above would hand back the whole
    document under a name that only rewrites `.jpg`. Batched with every
    other thumbnail read in the same turn, since a screen showing paper
    beside photographs should still make one round trip. */
export async function readThumbnailFile(name: string): Promise<Uint8Array | null> {
  return enqueue(name);
}

/** A stored photo's full bytes, on the same terms. Only the journey export
    (ticket 27) reads these: a screen drawing a photo wants the thumbnail,
    and a composed collage at 360px a cell would show the difference. Not
    batched - one deliberate pass over one photo at a time is what that is,
    and a queue would only hold its bytes in memory for longer. */
export async function readPhoto(fileName: string): Promise<Uint8Array | null> {
  return store ? store.read(fileName) : null;
}
