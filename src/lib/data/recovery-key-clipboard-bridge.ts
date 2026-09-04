import { androidPluginOwners, registerAndroidPlugin } from '$lib/android/plugin-registry';

export interface SensitiveClipboardCopy {
  /** What goes on the clipboard. Never logged: see the plugin's header and
      capacitor.config.ts's loggingBehavior. */
  value: string;
  /** How long the value may stay there before the app takes it back. */
  clearAfterMs: number;
}

export interface SensitiveClipboardBridge {
  copy(request: SensitiveClipboardCopy): Promise<void>;
}

/** Write-only by design: there is no read method here and none in the plugin,
    so nothing in this app can ask what is on the clipboard. */
export const sensitiveClipboard = registerAndroidPlugin<SensitiveClipboardBridge>(
  androidPluginOwners.sensitiveClipboard
);
