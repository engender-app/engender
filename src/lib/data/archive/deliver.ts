/* Getting a packed archive off the device (ticket 13, PRD F14).

   The share sheet first, which is what Android's WebView answers with and
   what makes "send it to my own cloud drive" one tap, then a plain
   download. A cancelled share sheet is its own answer rather than a
   failure - the screen must not claim a backup was made.

   The archive is packed as a stream (pack.ts) and this hands all of it to
   one Blob, which is the limit of what the format's bounded memory buys at
   the last step: chunking means the bytes are never encrypted and held a
   second time, which is what single-shot AES-GCM costs, but both a File to
   share and an object URL to download need the whole archive to exist
   somewhere. A Blob is the least bad somewhere - the browser owns it,
   large ones spill to disk rather than sitting in the renderer's heap.
   Writing it out as it is produced instead needs a save-file picker, which
   Android's WebView does not have. */

import { foldText } from '../fold';
import { dateInputValueFromEpochDay, todayEpochDay } from '../epochDay';
import { ARCHIVE_FILE_EXTENSION } from './container';

/** Whether the archive left, and how - so the caller can tell a cancelled
    share sheet from a delivered file. */
export type Delivery = 'shared' | 'downloaded' | 'cancelled';

/* navigator.share and canShare are not in TypeScript's DOM lib as
   file-capable, and canShare is absent from it entirely. */
type Sharing = {
  canShare?: (data: { files: File[] }) => boolean;
  share?: (data: { files: File[]; title?: string }) => Promise<void>;
};

/** `alicja-journal-2026-08-11.ttbackup`, or `journal-...` when the journal
    has no display name. Folded and stripped rather than percent-escaped: it
    passes through a share sheet, a file picker, and whatever filesystem is
    on the other side. */
export function archiveFileName(name: string, epochDay: number = todayEpochDay()): string {
  const slug = foldText(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug ? `${slug}-` : ''}journal-${dateInputValueFromEpochDay(epochDay)}${ARCHIVE_FILE_EXTENSION}`;
}

export async function deliverArchive(fileName: string, archive: AsyncIterable<Uint8Array>): Promise<Delivery> {
  const parts: BlobPart[] = [];
  for await (const piece of archive) parts.push(piece as BlobPart);
  const blob = new Blob(parts, { type: 'application/octet-stream' });

  const sharing = navigator as Navigator & Sharing;
  const file = new File([blob], fileName, { type: blob.type });
  if (sharing.canShare?.({ files: [file] }) && sharing.share) {
    try {
      await sharing.share({ files: [file], title: fileName });
      return 'shared';
    } catch (error) {
      // The one error worth reading: the user closed the sheet. Anything
      // else - no handler for the type, a share that failed - is still
      // worth falling back to a download for.
      if ((error as DOMException)?.name === 'AbortError') return 'cancelled';
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
  return 'downloaded';
}
