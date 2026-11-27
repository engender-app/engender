/* Android streams to private staging and verifies the save destination.
   Browsers try sharing, then downloading. A cancelled share means the
   backup was not delivered. Browser packing streams into one Blob because
   both a share File and a download URL require the finished archive. */

import { isAndroid } from '../../platform';
import { nameSlug } from '../fold';
import { dateInputValueFromEpochDay, todayEpochDay } from '../epochDay';

/** Whether the file left, and how - so the caller can tell a cancelled
    share sheet from a delivered file. */
export type Delivery = 'shared' | 'downloaded' | 'cancelled';

/* navigator.share and canShare are not in TypeScript's DOM lib as
   file-capable, and canShare is absent from it entirely. */
type Sharing = {
  canShare?: (data: { files: File[] }) => boolean;
  share?: (data: { files: File[]; title?: string }) => Promise<void>;
};

/** `alicja-journal-2026-08-11.gnd`, or `journal-...` when the journal
    has no display name. Folded and stripped rather than percent-escaped: it
    passes through a share sheet, a file picker, and whatever filesystem is
    on the other side. The extension is the caller's, because the plain
    export writes the same name with `.csv` and `.json` (F22). */
export function exportFileName(name: string, extension: string, epochDay: number = todayEpochDay(), disguised = false): string {
  if (disguised) return `backup-${dateInputValueFromEpochDay(epochDay)}${extension}`;
  const slug = nameSlug(name);
  return `${slug ? `${slug}-` : ''}journal-${dateInputValueFromEpochDay(epochDay)}${extension}`;
}

export async function deliverFile(file: {
  fileName: string;
  type: string;
  recordBackup?: boolean;
  body: AsyncIterable<Uint8Array>;
}): Promise<Delivery> {
  if (isAndroid()) return (await import('./android-file-delivery')).deliverAndroidFile(file);
  const parts: BlobPart[] = [];
  for await (const piece of file.body) parts.push(piece as BlobPart);
  return deliverBlob(file.fileName, new Blob(parts, { type: file.type }));
}

/** The same hand-off for something already whole in memory: ticket 27's
    collage and timelapse come off a canvas as a Blob, and this is what keeps
    them on the one share path rather than growing a second one. */
export async function deliverBlob(fileName: string, blob: Blob): Promise<Delivery> {
  if (isAndroid()) {
    return (await import('./android-file-delivery')).deliverAndroidFile({
      fileName,
      type: blob.type,
      body: (async function* () {
        for (let at = 0; at < blob.size; at += 1024 * 1024) {
          yield new Uint8Array(await blob.slice(at, at + 1024 * 1024).arrayBuffer());
        }
      })()
    });
  }
  const sharing = navigator as Navigator & Sharing;
  const shared = new File([blob], fileName, { type: blob.type });
  if (sharing.canShare?.({ files: [shared] }) && sharing.share) {
    try {
      await sharing.share({ files: [shared], title: fileName });
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
