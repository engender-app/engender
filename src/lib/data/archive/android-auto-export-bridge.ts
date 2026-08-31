import { androidPluginOwners, registerAndroidPlugin } from '$lib/android/plugin-registry';
import type { Argon2Params } from '$lib/crypto/params';

export type AutoExportSchedule = 'weekly' | 'monthly';

export interface AutoExportStatus {
  enabled: boolean;
  schedule: AutoExportSchedule;
  destinationUri: string | null;
  destinationLabel: string | null;
  hasPassword: boolean;
  nextDueAt: number | null;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastFailureReason: string | null;
}

export interface AndroidAutoExportBridge {
  status(): Promise<AutoExportStatus>;
  pickDestination(): Promise<{ picked: boolean; destinationUri: string | null; destinationLabel: string | null }>;
  configure(options: { enabled: boolean; schedule: AutoExportSchedule }): Promise<AutoExportStatus>;
  setPassword(options: { password: string }): Promise<void>;
  /** Derives an archive encryption key from the saved backup password
      behind the bridge (phase 5 security ticket 06, F-04), returning a key
      for one archive rather than the cleartext password. */
  deriveKey(options: { salt: string; kdf: Argon2Params }): Promise<{ key: string | null }>;
  clearPassword(): Promise<void>;
  writeBackup(options: { fileName: string; base64: string }): Promise<{ writtenAt: number }>;
  notifyFailure(): Promise<void>;
}

export const androidAutoExport = registerAndroidPlugin<AndroidAutoExportBridge>(androidPluginOwners.autoExport);