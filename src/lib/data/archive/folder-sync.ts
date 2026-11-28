/* After Android unlock, merge another device's newer archive from the
   chosen auto-export folder via the same journal.archive.merge as
   manual import (ADR-0098). FolderArchives.java skips this device's
   exports and previously tried files. Derive the key in the plugin
   so the saved password stays there. Report the result so it can
   advance. Web has no folder sync (ADR-0099). */

import { isAndroid } from '../../platform';
import { archiveFailureKind } from './failure';
import { spaceShortage } from '../spaceShortage';
import { openArchive, type KeyDerivation } from './pack';
import type { RestoreContents } from '../journal/restore';
import { androidAutoExport, type AutoExportStatus, type FolderSyncOutcome } from './android-auto-export-bridge';

export interface FolderSyncDeps {
  /** Archive Merge, the import screen's own (journal.archive.merge). */
  merge(contents: RestoreContents): Promise<void>;
  /** The staged copy's bytes. On Android a fetch from the local server. */
  read(path: string): AsyncIterable<Uint8Array>;
  /** Stops the sync before it writes. Once Merge has begun it finishes:
      Merge has no rollback part way through. */
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
  let staged: Awaited<ReturnType<typeof androidAutoExport.stageFolderArchive>>;
  try {
    staged = await androidAutoExport.stageFolderArchive();
  } catch (error) {
    /* Copying the archive out of the folder can fill the device before Merge starts
       (finding 2), and that used to reach only the console. Nothing was staged, so there is
       no position to keep: the outcome is recorded for the settings line, at 0. */
    if (spaceShortage(error) !== 'device') throw error;
    console.error('folder sync could not copy an archive', error);
    await androidAutoExport.finishFolderArchive({ modifiedAt: 0, outcome: 'no-space' })
      .catch((failure: unknown) => console.error('folder sync could not record its outcome', failure));
    return { outcome: 'no-space', modifiedAt: 0 };
  }
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
    /* A lock during the open stays a lock even when the open then fails on
       its own (a wrong password, say): the archive is tried again next time
       rather than reported and moved past while nobody was looking. */
    if ((error as Error)?.name === 'AbortError' || deps.signal?.aborted) throw error;
    console.error('folder sync could not merge an archive', error);
    /* A full device is not the archive's fault: reported as what it is, and left to be
       tried again (finding 1). */
    if (spaceShortage(error) === 'device') return 'no-space';
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
