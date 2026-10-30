/* Folder sync (functional audit ticket 49): the other half of auto-export.

   Auto-export writes this device's journal into a folder the person chose.
   When something outside the app (Syncthing, a cable, a cloud folder) puts
   another device's auto-export into the same folder, the next open after
   unlock merges it with Archive Merge's rules (ADR-0098), so the two
   journals meet without a network. There is one merge path: this opens the
   archive and hands it to the same `journal.archive.merge` the import
   screen uses.

   The plugin picks the archive (FolderArchives.java): only one another
   device wrote, never one of this device's own backups, and only one
   modified after the last it tried. This side opens it with the saved
   backup password, which never crosses the bridge - the key is derived
   behind it, as for packing an auto-export - and reports how it ended, so
   the plugin can move past it.

   Android only. The web build has no folder sync (ADR draft
   folder-sync-merges-another-devices-auto-export): a browser either cannot
   keep a folder at all or asks for it again every visit. */

import { isAndroid } from '../../platform';
import { archiveFailureKind } from './failure';
import { openArchive, type KeyDerivation } from './pack';
import type { RestoreContents } from '../journal/restore';
import { androidAutoExport, type AutoExportStatus, type FolderSyncOutcome } from './android-auto-export-bridge';

export interface FolderSyncDeps {
  /** Archive Merge, the import screen's own (journal.archive.merge). */
  merge(contents: RestoreContents): Promise<void>;
  /** The staged copy's bytes. On Android a fetch from the local server. */
  read(path: string): AsyncIterable<Uint8Array>;
  /** Stops the sync before it writes. Once Merge has begun it finishes:
      Merge has no rollback part way through (ADR-0070). */
  signal?: AbortSignal;
}

export type FolderSyncResult =
  | { outcome: 'none' }
  | { outcome: FolderSyncOutcome; modifiedAt: number };

const fromBase64 = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

const BASE64_CHUNK = 0x8000;
const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK));
  }
  return btoa(binary);
};

const savedPassword: KeyDerivation = async (salt, kdf) => {
  const { key } = await androidAutoExport.deriveKey({ salt: toBase64(salt), kdf });
  if (!key) throw new Error('no-password');
  return fromBase64(key);
};

/** Whether this device would look in the folder at all. */
export function folderSyncReady(status: Pick<AutoExportStatus, 'folderSync' | 'destinationUri' | 'hasPassword'>): boolean {
  return !!status.folderSync && !!status.destinationUri && status.hasPassword;
}

export async function runFolderSync(status: AutoExportStatus, deps: FolderSyncDeps): Promise<FolderSyncResult> {
  if (!isAndroid() || !folderSyncReady(status)) return { outcome: 'none' };
  deps.signal?.throwIfAborted();
  const staged = await androidAutoExport.stageFolderArchive();
  if (!staged.path || staged.modifiedAt == null) return { outcome: 'none' };
  const modifiedAt = staged.modifiedAt;

  let outcome: FolderSyncOutcome | 'cancelled' = 'cancelled';
  try {
    outcome = await mergeStaged(staged.path, deps);
    return { outcome, modifiedAt };
  } finally {
    await androidAutoExport.finishFolderArchive({ modifiedAt, outcome })
      .catch((error: unknown) => console.error('folder sync could not record its outcome', error));
  }
}

/* Throws only an abort, and only before Merge has written anything; every
   other way it can end is an outcome the plugin records. */
async function mergeStaged(path: string, deps: FolderSyncDeps): Promise<FolderSyncOutcome> {
  try {
    const { payload, files } = await openArchive(deps.read(path), savedPassword);
    deps.signal?.throwIfAborted();
    await deps.merge({
      journal: payload.journal,
      preferences: payload.preferences,
      files,
      fileCount: payload.files.length
    });
    return 'merged';
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    console.error('folder sync could not merge an archive', error);
    return archiveFailureKind(error);
  }
}

/** A staged file as byte pieces, fetched from Capacitor's local server
    rather than through the bridge, which turns bytes into a JSON string
    (android-file-store.ts). */
export async function* localFileBytes(url: string): AsyncGenerator<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error('folder-archive-unreadable');
  const reader = response.body.getReader();
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
