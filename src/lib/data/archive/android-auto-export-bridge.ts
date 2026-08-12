import { registerPlugin } from '@capacitor/core';

export type AutoExportSchedule = 'weekly' | 'monthly';

export interface AutoExportStatus {
  enabled: boolean;
  schedule: AutoExportSchedule;
  destinationUri: string | null;
  destinationLabel: string | null;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastFailureReason: string | null;
}

export interface AndroidAutoExportBridge {
  status(): Promise<AutoExportStatus>;
  pickDestination(): Promise<{ picked: boolean; destinationUri: string | null; destinationLabel: string | null }>;
  configure(options: { enabled: boolean; schedule: AutoExportSchedule }): Promise<AutoExportStatus>;
  writeBackup(options: { fileName: string; base64: string }): Promise<{ writtenAt: number }>;
}

export const androidAutoExport = registerPlugin<AndroidAutoExportBridge>('AutoExport');