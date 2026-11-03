import { androidPluginOwners, registerAndroidPlugin } from '$lib/android/plugin-registry';
import type { Argon2Params } from '$lib/crypto/params';

type AutoExportSchedule = 'weekly' | 'monthly';

export interface AutoExportStatus {
  enabled: boolean;
  schedule: AutoExportSchedule;
  destinationUri: string | null;
  destinationLabel: string | null;
  hasPassword: boolean;
  nextDueAt: number | null;
  lastSuccessAt: number | null;
  lastSnapshotAt?: number | null;
  stagedSnapshotAt?: number | null;
  deferredAt?: number | null;
  lastFailureAt: number | null;
  lastFailureReason: string | null;
  /** Folder sync (FA 49): whether this device merges other devices'
      archives from the folder, and how the last one it tried ended. */
  folderSync?: boolean;
  folderLastOutcome?: FolderSyncOutcome | null;
  folderLastAt?: number | null;
}

/** How a folder archive ended: merged, or the archive's own failure kind
    (archive/failure.ts). `cancelled` leaves the folder's position alone.
    `no-space`: this device ran out of room part way. Unlike the others it
    leaves the folder's position where it was, so the same archive is tried
    again once space is freed (re-check carpet 13). */
export type FolderSyncOutcome = 'merged' | 'wrong-password' | 'newer-version' | 'not-an-archive' | 'corrupt' | 'failed' | 'no-space';

interface AndroidAutoExportBridge {
  status(): Promise<AutoExportStatus>;
  pickDestination(): Promise<{ picked: boolean; destinationUri: string | null; destinationLabel: string | null }>;
  configure(options: { enabled: boolean; schedule: AutoExportSchedule }): Promise<AutoExportStatus>;
  setPassword(options: { password: string }): Promise<void>;
  /** Whether a typed password is the saved backup password (FA 56). The
      saved one never crosses the bridge; only the answer does. */
  checkPassword(options: { password: string }): Promise<{ matches: boolean }>;
  /** Derives an archive encryption key from the saved backup password
      behind the bridge (phase 5 security ticket 06, F-04), returning a key
      for one archive rather than the cleartext password. */
  deriveKey(options: { salt: string; kdf: Argon2Params }): Promise<{ key: string | null }>;
  clearPassword(): Promise<void>;
  beginBackup(options: { fileName: string; snapshotAt?: number; scheduled?: boolean }): Promise<{ transferId: string }>;
  appendBackup(options: { transferId: string; offset: number; base64: string }): Promise<void>;
  finishBackup(options: { transferId: string; byteLength: number; sha256: string }): Promise<{ writtenAt: number | null; staged?: boolean }>;
  abortPendingTransfers(): Promise<void>;
  abortBackup(options: { transferId: string }): Promise<void>;
  configureFolderSync(options: { enabled: boolean }): Promise<AutoExportStatus>;
  /** Copies the newest archive another device wrote into the folder, newer
      than the last one merged, to an app-private path; null when there is
      none. This device's own backups are never staged. */
  stageFolderArchive(): Promise<{ path: string | null; modifiedAt?: number }>;
  finishFolderArchive(options: { modifiedAt: number; outcome: FolderSyncOutcome | 'cancelled' }): Promise<AutoExportStatus>;
  /** Posts the scheduled-backup failure notice (phase 6 ticket 04). The
      strings arrive from this side now, so the notice is localized and the
      registry's disguise rule can reach it - the plugin used to hold English
      literals and had no way to know about either. */
  notifyFailure(options: { title: string; body: string; channelName: string }): Promise<void>;
}

export const androidAutoExport = registerAndroidPlugin<AndroidAutoExportBridge>(androidPluginOwners.autoExport);