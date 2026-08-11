/* Choosing an archive to import (ticket 14, PRD F14).

   The web half, like photos/picker.ts is for photos: on Android this becomes
   the shell's own file picker, and the screen above must never learn which
   one it got.

   Bytes rather than a File, and a stream rather than one buffer: opening an
   archive reads the header, then the payload, then the photo files as the
   body reaches them (pack.ts), so restoring years of photos never holds more
   than a chunk of it.

   `bytes()` is a function and not a value, because a wrong password is a
   retry rather than a dead end: every attempt gets its own read of the same
   file, and a stream cannot be consumed twice. */

import { chooseFiles } from '../fileDialog';
import { ARCHIVE_FILE_EXTENSION } from './container';

export interface PickedArchive {
  /** What to show the user they picked. Never a path. */
  name: string;
  /** A fresh read of the file, from the start. */
  bytes(): AsyncIterable<Uint8Array>;
}

/** The archive the user chose, or null if they backed out - an ordinary
    outcome, not an error. */
export async function pickArchive(): Promise<PickedArchive | null> {
  const [file] = await chooseFiles(ARCHIVE_FILE_EXTENSION);
  return file ? { name: file.name, bytes: () => blobBytes(file) } : null;
}

/** A Blob as byte pieces. Spelled out with a reader rather than iterating
    `blob.stream()` directly, which not every browser this app targets treats
    as async-iterable yet. */
async function* blobBytes(blob: Blob): AsyncGenerator<Uint8Array> {
  const reader = blob.stream().getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}
