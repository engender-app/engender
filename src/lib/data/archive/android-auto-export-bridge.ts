import { androidPluginOwners, registerAndroidPlugin } from '$lib/android/plugin-registry';

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
  revealPassword(): Promise<{ password: string | null }>;
  clearPassword(): Promise<void>;
  writeBackup(options: { fileName: string; base64: string }): Promise<{ writtenAt: number }>;
  notifyFailure(): Promise<void>;
}

export const androidAutoExport = registerAndroidPlugin<AndroidAutoExportBridge>(androidPluginOwners.autoExport);