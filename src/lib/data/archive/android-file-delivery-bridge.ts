import { androidPluginOwners, registerAndroidPlugin } from '$lib/android/plugin-registry';

interface FileDeliveryBridge {
  beginFile(options: { fileName: string; type: string }): Promise<{ transferId: string }>;
  appendFile(options: { transferId: string; offset: number; base64: string }): Promise<void>;
  finishFile(options: { transferId: string; byteLength: number; sha256: string }): Promise<{ saved: boolean }>;
  abortFile(options: { transferId: string }): Promise<void>;
}

export const androidFileDelivery = registerAndroidPlugin<FileDeliveryBridge>(androidPluginOwners.fileDelivery);
