import { androidPluginOwners, registerAndroidPlugin } from '$lib/android/plugin-registry';

interface AndroidPrintJob {
  /** What the print dialog and the resulting file are named. */
  jobName: string;
}

interface AndroidPrintBridge {
  print(job: AndroidPrintJob): Promise<void>;
}

export const androidPrint = registerAndroidPlugin<AndroidPrintBridge>(androidPluginOwners.print);
