/* Choosing an archive to import (ticket 14, PRD F14).

   One seam, two platforms, for the same reason photos/picker.ts has one: on
   the web this is a file input, on Android it will be the shell's file
   picker, and the screen above must never learn which one it got.

   Bytes rather than a File, and a stream rather than one buffer: opening an
   archive reads the header, then the payload, then the photo files as the
   body reaches them (pack.ts), so a restore of years of photos never holds
   more than a chunk of it.

   `bytes()` is a function and not a value, because a wrong password is a
   retry rather than a dead end: every attempt gets its own read of the same
   file, and a stream cannot be consumed twice. */

import { ARCHIVE_FILE_EXTENSION } from './container';

export interface PickedArchive {
  /** What to show the user they picked. Never a path. */
  name: string;
  /** A fresh read of the file, from the start. */
  bytes(): AsyncIterable<Uint8Array>;
}

export interface ArchivePicker {
  /** The archive the user chose, or null if they backed out - an ordinary
      outcome, not an error. */
  pick(): Promise<PickedArchive | null>;
}

export function fileArchivePicker(): ArchivePicker {
  return {
    pick() {
      return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        // A hint to the dialog, not a guarantee: what the file actually is
        // gets decided by its header, which is plaintext for exactly this
        // reason (ADR-0007).
        input.accept = ARCHIVE_FILE_EXTENSION;

        const done = (result: PickedArchive | null | Error) => {
          input.remove();
          if (result instanceof Error) reject(result);
          else resolve(result);
        };

        input.addEventListener('change', () => {
          const file = input.files?.[0];
          done(file ? { name: file.name, bytes: () => blobBytes(file) } : null);
        });
        // Chromium fires this when the dialog is dismissed; without it the
        // promise would never settle and the screen would wait forever.
        input.addEventListener('cancel', () => done(null));

        input.style.display = 'none';
        document.body.append(input);
        input.click();
      });
    }
  };
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
