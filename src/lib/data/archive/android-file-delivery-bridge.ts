import { androidPluginOwners, registerAndroidPlugin } from '$lib/android/plugin-registry';

interface FileDeliveryBridge {
  beginFile(options: { fileName: string; type: string; recordBackup?: boolean }): Promise<{ transferId: string }>;
  appendFile(options: { transferId: string; offset: number; base64: string }): Promise<void>;
  finishFile(options: { transferId: string; byteLength: number; sha256: string }): Promise<{ saved: boolean }>;
  recoveryStatus(): Promise<{ processId: string; resetEpoch: number; interrupted: boolean; cleanupPending: boolean }>;
  abortPendingTransfers(): Promise<void>;
  abortFile(options: { transferId: string }): Promise<void>;
}

export const androidFileDelivery = registerAndroidPlugin<FileDeliveryBridge>(androidPluginOwners.fileDelivery);
